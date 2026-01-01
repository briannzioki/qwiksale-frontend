// src/app/api/billing/upgrade/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { logMpesaBootOnce, normalizeMsisdn, stkPush } from "@/app/lib/mpesa";
import { prisma } from "@/app/lib/prisma";

/* ---------------- analytics (console-only for now) ---------------- */
type AnalyticsEvent =
  | "billing_upgrade_attempt"
  | "billing_upgrade_unauthorized"
  | "billing_upgrade_invalid_phone"
  | "billing_upgrade_payment_precreate"
  | "billing_upgrade_payment_precreate_skip"
  | "billing_upgrade_stk_error"
  | "billing_upgrade_stk_missing_checkout_id"
  | "billing_upgrade_upsert"
  | "billing_upgrade_dedupe_deleted"
  | "billing_upgrade_success"
  | "billing_upgrade_error";

function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  try {
    // eslint-disable-next-line no-console
    console.log(`[track] ${event}`, { ts: new Date().toISOString(), ...props });
  } catch {
    /* no-op */
  }
}

type Tier = "GOLD" | "PLATINUM";
const PRICE: Record<Tier, number> = { GOLD: 199, PLATINUM: 499 };

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function clampTier(raw: unknown): Tier {
  const t = String(raw || "GOLD").toUpperCase();
  return t === "PLATINUM" ? "PLATINUM" : "GOLD";
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

    // --- auth ---
    const session = await auth();
    const email = (session as any)?.user?.email as string | undefined;
    if (!email) {
      track("billing_upgrade_unauthorized", { reqId });
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) {
      track("billing_upgrade_unauthorized", { reqId });
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    // --- parse body ---
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const { tier: bodyTier, phone, mode: rawMode } = (body || {}) as {
      tier?: string;
      phone?: string;
      mode?: "paybill" | "till";
    };

    const tier = clampTier(bodyTier);

    // ✅ server-trusted amount ONLY
    const amount = PRICE[tier];

    const msisdn = normalizeMsisdn(String(phone || ""));
    const mode: "paybill" | "till" = rawMode === "till" ? "till" : "paybill";

    track("billing_upgrade_attempt", {
      reqId,
      userId: user.id,
      tier,
      amount,
      mode,
      hasPhone: !!phone,
    });

    if (!/^254(7|1)\d{8}$/.test(msisdn)) {
      track("billing_upgrade_invalid_phone", { reqId, userId: user.id });
      return noStore({ error: "Invalid phone (use 2547XXXXXXXX or 2541XXXXXXXX)" }, { status: 400 });
    }

    // --- pre-create Payment row (best effort) ---
    let pendingId: string | null = null;
    try {
      const created = await (prisma as any).payment.create({
        data: {
          userId: user.id,
          payerPhone: msisdn,
          amount,
          status: "PENDING",
          method: "MPESA",
          currency: "KES",
          accountRef: "QWIKSALE",
          // best-effort extras if present:
          targetTier: tier,
          mode,
        },
        select: { id: true },
      });
      pendingId = created?.id ?? null;
      track("billing_upgrade_payment_precreate", { reqId, userId: user.id, paymentId: pendingId });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[billing/upgrade] Payment pre-create skipped:", e);
      track("billing_upgrade_payment_precreate_skip", { reqId, reason: "exception" });
    }

    // --- STK push (single truth) ---
    let data: any;
    try {
      data = await stkPush({
        amount,
        phone: msisdn,
        mode,
        accountReference: "QWIKSALE",
        description: `Upgrade ${tier}`,
      });
    } catch (e: any) {
      // mark FAILED best effort
      if (pendingId) {
        await (prisma as any).payment
          .update({
            where: { id: pendingId },
            data: {
              status: "FAILED",
              rawCallback: {
                phase: "stkPush",
                message: String(e?.message ?? e).slice(0, 200),
                at: new Date().toISOString(),
              },
            },
          })
          .catch(() => {});
      }

      track("billing_upgrade_stk_error", {
        reqId,
        userId: user.id,
        paymentId: pendingId,
        message: String(e?.message ?? e),
      });

      return noStore({ ok: false, error: e?.message || "Failed to initiate STK", paymentId: pendingId }, { status: 502 });
    }

    const checkoutId = String(data?.CheckoutRequestID ?? "").trim();
    const merchantId = String(data?.MerchantRequestID ?? "").trim();

    if (!checkoutId) {
      if (pendingId) {
        await (prisma as any).payment
          .update({
            where: { id: pendingId },
            data: {
              status: "FAILED",
              rawCallback: {
                phase: "stkPush",
                message: "Missing CheckoutRequestID in Daraja response",
                at: new Date().toISOString(),
                data,
              },
            },
          })
          .catch(() => {});
      }

      track("billing_upgrade_stk_missing_checkout_id", { reqId, userId: user.id, paymentId: pendingId });

      return noStore({ ok: false, error: "STK push failed (missing CheckoutRequestID)", paymentId: pendingId }, { status: 502 });
    }

    // --- upsert by CheckoutRequestID (callback race-safe) ---
    const saved = await (prisma as any).payment.upsert({
      where: { checkoutRequestId: checkoutId },
      update: {
        merchantRequestId: merchantId || null,
        payerPhone: msisdn,
        amount,
        accountRef: "QWIKSALE",
        // keep tier/mode if columns exist:
        targetTier: tier,
        mode,
      },
      create: {
        status: "PENDING",
        method: "MPESA",
        currency: "KES",
        amount,
        payerPhone: msisdn,
        accountRef: "QWIKSALE",
        checkoutRequestId: checkoutId,
        merchantRequestId: merchantId || null,
        userId: user.id,
        targetTier: tier,
        mode,
      },
      select: { id: true },
    });

    track("billing_upgrade_upsert", {
      reqId,
      userId: user.id,
      pendingId,
      savedId: saved.id,
      hasCheckoutId: true,
      hasMerchantId: !!merchantId,
    });

    // --- dedupe: if callback inserted first, remove the pre-created pending row ---
    if (pendingId && saved.id !== pendingId) {
      await (prisma as any).payment.delete({ where: { id: pendingId } }).catch(() => {});
      track("billing_upgrade_dedupe_deleted", { reqId, userId: user.id, pendingId, savedId: saved.id });
    }

    track("billing_upgrade_success", { reqId, userId: user.id, paymentId: saved.id });

    return noStore({
      ok: true,
      tier,
      amount,
      mode,
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
    console.error("[billing/upgrade] error:", e);
    track("billing_upgrade_error", { reqId, message: e?.message ?? String(e) });
    return noStore({ error: e?.message || "Server error" }, { status: 500 });
  }
}
