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
  | "mpesa_stk_missing_checkout_id"
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
  msisdn: string; // accepts 07/01/+254/254 forms
  mode?: "till" | "paybill";
  productId?: string;
  userId?: string;
  accountRef?: string;
  description?: string;
};

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function mkReqId() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = (globalThis as any).crypto;
    return c?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

export async function POST(req: Request) {
  const reqId = mkReqId();

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
    const phone = normalizeMsisdn(phoneRaw);
    if (!/^254(7|1)\d{8}$/.test(phone)) {
      track("mpesa_stk_invalid_msisdn", { reqId });
      return noStore(
        { error: "Invalid msisdn (use 2547XXXXXXXX or 2541XXXXXXXX)" },
        { status: 400 },
      );
    }

    const accountRef = String(parsed?.accountRef ?? "QWIKSALE").slice(0, 12);
    const description = String(parsed?.description ?? "Qwiksale payment").slice(0, 32);

    // ✅ concrete mode (avoids exactOptionalPropertyTypes footguns)
    const mode: "paybill" | "till" = parsed?.mode === "till" ? "till" : "paybill";

    track("mpesa_stk_attempt", {
      reqId,
      hasProductId: !!parsed?.productId,
      hasUserId: !!parsed?.userId,
      mode,
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
        mode,
      });
    } catch (err: any) {
      await prisma.payment
        .update({
          where: { id: pending.id },
          data: {
            status: "FAILED",
            rawCallback: {
              phase: "stkPush",
              message: String(err?.message ?? err).slice(0, 200),
              at: new Date().toISOString(),
            } as any,
          },
        })
        .catch(() => {});

      track("mpesa_stk_push_error", {
        reqId,
        paymentId: pending.id,
        message: String(err?.message || err),
      });

      return noStore({ error: err?.message || "Failed to initiate STK" }, { status: 502 });
    }

    const checkoutId = String(data?.CheckoutRequestID ?? "").trim();
    const merchantId = String(data?.MerchantRequestID ?? "").trim();

    // ✅ must have CheckoutRequestID (otherwise upsert may blow up / corrupt)
    if (!checkoutId) {
      await prisma.payment
        .update({
          where: { id: pending.id },
          data: {
            status: "FAILED",
            rawCallback: {
              phase: "stkPush",
              message: "Missing CheckoutRequestID in Daraja response",
              at: new Date().toISOString(),
              data,
            } as any,
          },
        })
        .catch(() => {});

      track("mpesa_stk_missing_checkout_id", { reqId, paymentId: pending.id });

      return noStore({ error: "STK push failed (missing CheckoutRequestID)" }, { status: 502 });
    }

    // ---- 3) upsert by CheckoutRequestID (handle callback race) --------------
    const saved = await prisma.payment.upsert({
      where: { checkoutRequestId: checkoutId },
      update: {
        merchantRequestId: merchantId || null,
        payerPhone: phone,
        accountRef,
      },
      create: {
        status: "PENDING",
        method: "MPESA",
        currency: "KES",
        amount,
        payerPhone: phone,
        accountRef,
        checkoutRequestId: checkoutId,
        merchantRequestId: merchantId || null,
        productId: parsed?.productId ?? null,
        userId: parsed?.userId ?? null,
      },
      select: { id: true },
    });

    track("mpesa_stk_upsert", {
      reqId,
      pendingId: pending.id,
      savedId: saved.id,
      hasCheckoutId: true,
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
        CheckoutRequestID: checkoutId,
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
