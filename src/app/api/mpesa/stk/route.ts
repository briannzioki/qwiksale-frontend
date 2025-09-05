// src/app/api/mpesa/stk/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { logMpesaBootOnce, normalizeMsisdn, stkPush } from "@/app/lib/mpesa";

/* ---------------- analytics (console-only for now) ---------------- */
type AnalyticsEvent =
  | "mpesa_stk_attempt"
  | "mpesa_stk_invalid_json"
  | "mpesa_stk_invalid_amount"
  | "mpesa_stk_invalid_msisdn"
  | "mpesa_stk_payment_precreate"
  | "mpesa_stk_push_error"
  | "mpesa_stk_upsert"
  | "mpesa_stk_dedupe_deleted"
  | "mpesa_stk_success"
  | "mpesa_stk_error"
  | "mpesa_stk_ping";

function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  try {
    // eslint-disable-next-line no-console
    console.log(`[track] ${event}`, { ts: new Date().toISOString(), ...props });
  } catch {
    /* no-op */
  }
}

type Body = {
  amount: number;
  msisdn: string;                 // accepts 07/01/+254/254 forms
  mode?: "till" | "paybill";
  productId?: string;             // optional linkage
  userId?: string;                // optional linkage
  accountRef?: string;            // optional override (<=12)
  description?: string;           // optional override (<=32)
};

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

export async function POST(req: Request) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    logMpesaBootOnce();

    // ---- parse & validate ---------------------------------------------------
    let parsed: Body;
    try {
      parsed = (await req.json()) as Body;
    } catch {
      track("mpesa_stk_invalid_json", { reqId });
      return noStore({ error: "Invalid JSON body" }, { status: 400 });
    }

    const amount = Math.round(Number(parsed?.amount));
    if (!Number.isFinite(amount) || amount < 1) {
      track("mpesa_stk_invalid_amount", { reqId, amount });
      return noStore({ error: "Invalid amount (min 1 KES)" }, { status: 400 });
    }

    const phoneRaw = String(parsed?.msisdn ?? "");
    const phone = normalizeMsisdn(phoneRaw); // 07/01/+254/254 -> 2547/2541…
    if (!/^254(7|1)\d{8}$/.test(phone)) {
      track("mpesa_stk_invalid_msisdn", { reqId });
      return noStore(
        { error: "Invalid msisdn (use 2547XXXXXXXX or 2541XXXXXXXX)" },
        { status: 400 }
      );
    }

    const accountRef =
      (parsed?.accountRef ?? "QWIKSALE").toString().slice(0, 12);
    const description =
      (parsed?.description ?? "Qwiksale payment").toString().slice(0, 32);

    track("mpesa_stk_attempt", {
      reqId,
      hasProductId: !!parsed?.productId,
      hasUserId: !!parsed?.userId,
      mode: parsed?.mode ?? "paybill",
      accountRefLength: accountRef.length,
      descriptionLength: description.length,
      amount,
    });

    // ---- 1) pre-create PENDING row -----------------------------------------
    const pending = await prisma.payment.create({
      data: {
        status: "PENDING",
        method: "MPESA",
        currency: "KES",
        amount,
        payerPhone: phone,
        accountRef,
        productId: parsed?.productId ?? null,
        userId: parsed?.userId ?? null,
      },
      select: { id: true },
    });
    track("mpesa_stk_payment_precreate", { reqId, paymentId: pending.id });

    // ---- 2) call STK push ---------------------------------------------------
    let data: any;
    try {
      data = await stkPush({
        amount,
        phone,
        accountReference: accountRef,
        description,
        mode: parsed?.mode,
      });
    } catch (err: any) {
      // Best effort: mark the pre-created row as FAILED so ops has a breadcrumb
      await prisma.payment
        .update({
          where: { id: pending.id },
          data: {
            status: "FAILED",
            resultDesc: err?.message?.slice?.(0, 200) || "STK push error",
          },
        })
        .catch(() => {});
      track("mpesa_stk_push_error", { reqId, paymentId: pending.id, message: String(err?.message || err) });
      return noStore({ error: err?.message || "Failed to initiate STK" }, { status: 502 });
    }

    // Safety: ensure IDs exist
    const checkoutId = data?.CheckoutRequestID || "";
    const merchantId = data?.MerchantRequestID || "";

    // ---- 3) upsert by CheckoutRequestID (handle callback race) --------------
    const saved = await prisma.payment.upsert({
      where: { checkoutRequestId: checkoutId },
      update: {
        merchantRequestId: merchantId,
      },
      create: {
        status: "PENDING",
        method: "MPESA",
        currency: "KES",
        amount,
        payerPhone: phone,
        accountRef,
        checkoutRequestId: checkoutId,
        merchantRequestId: merchantId,
        productId: parsed?.productId ?? null,
        userId: parsed?.userId ?? null,
      },
      select: { id: true },
    });
    track("mpesa_stk_upsert", {
      reqId,
      pendingId: pending.id,
      savedId: saved.id,
      hasCheckoutId: !!checkoutId,
      hasMerchantId: !!merchantId,
    });

    // ---- 4) de-dupe if callback created it first ----------------------------
    if (saved.id !== pending.id) {
      await prisma.payment.delete({ where: { id: pending.id } }).catch(() => {});
      track("mpesa_stk_dedupe_deleted", { reqId, pendingId: pending.id, savedId: saved.id });
    }

    // ---- 5) respond ---------------------------------------------------------
    track("mpesa_stk_success", { reqId, paymentId: saved.id });
    return noStore({
      ok: true,
      message: data?.CustomerMessage || "STK push sent. Confirm on your phone.",
      paymentId: saved.id,
      mpesa: {
        MerchantRequestID: merchantId || null,
        CheckoutRequestID: checkoutId || null,
        ResponseCode: data?.ResponseCode ?? null,
        ResponseDescription: data?.ResponseDescription ?? null,
        CustomerMessage: data?.CustomerMessage ?? null,
      },
    });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn("[mpesa] /api/mpesa/stk error:", e?.message || e);
    track("mpesa_stk_error", { reqId, message: e?.message ?? String(e) });
    return noStore({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function GET() {
  track("mpesa_stk_ping", { method: "GET" });
  return noStore({ status: "stk alive" }, { status: 200 });
}

export async function HEAD() {
  track("mpesa_stk_ping", { method: "HEAD" });
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
