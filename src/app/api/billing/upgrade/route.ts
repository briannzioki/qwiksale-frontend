// src/app/api/billing/upgrade/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAccessToken, stkPassword, yyyymmddhhmmss, MPESA } from "@/app/lib/mpesa";
import { prisma } from "@/app/lib/prisma";

/* ---------------- analytics (console-only for now) ---------------- */
type AnalyticsEvent =
  | "billing_upgrade_attempt"
  | "billing_upgrade_unauthorized"
  | "billing_upgrade_invalid_phone"
  | "billing_upgrade_payment_precreate"
  | "billing_upgrade_payment_precreate_skip"
  | "billing_upgrade_mpesa_token_error"
  | "billing_upgrade_mpesa_request_error"
  | "billing_upgrade_mpesa_error"
  | "billing_upgrade_mpesa_success"
  | "billing_upgrade_payment_postupdate"
  | "billing_upgrade_payment_postupdate_skip"
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

// ---- helpers ---------------------------------------------------------------

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

// "07xxxxxxxx" / "+2547xxxxxxxx" / "2547xxxxxxxx" -> "2547xxxxxxxx"
function normalizeMsisdn(input: string): string {
  let s = String(input || "").trim();
  s = s.replace(/\s+/g, "");
  s = s.replace(/^\+/, "");
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^7\d{8}$/.test(s)) s = "254" + s; // allow bare 7xxxxxxxx
  return s;
}

function isValidMsisdn254(s: string) {
  return /^2547\d{8}$/.test(s);
}

function clampTier(raw: unknown): Tier {
  const t = String(raw || "GOLD").toUpperCase();
  return t === "PLATINUM" ? "PLATINUM" : "GOLD";
}

function mapTxnType(mode: "paybill" | "till") {
  return mode === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";
}

// ---- route -----------------------------------------------------------------

export async function POST(req: Request) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
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
    const amount = PRICE[tier];
    const msisdn = normalizeMsisdn(String(phone || ""));
    const mode: "paybill" | "till" = rawMode === "till" ? "till" : "paybill";
    const transactionType = mapTxnType(mode);

    track("billing_upgrade_attempt", {
      reqId,
      userId: user.id,
      tier,
      amount,
      mode,
      hasPhone: !!phone,
    });

    if (!isValidMsisdn254(msisdn)) {
      track("billing_upgrade_invalid_phone", { reqId, userId: user.id });
      return noStore({ error: "Invalid phone (use 2547XXXXXXXX)" }, { status: 400 });
    }

    // --- optional dedupe of recent pending attempts ---
    let existingPending: any | null = null;
    try {
      if ((prisma as any).payment?.findFirst) {
        existingPending = await (prisma as any).payment.findFirst({
          where: { userId: user.id, status: "PENDING" },
          orderBy: { createdAt: "desc" },
        });
      }
    } catch {
      /* no-op */
    }

    // --- pre-create Payment row (best effort) ---
    let paymentId: string | undefined;
    try {
      const Payment = (prisma as any).payment;
      if (Payment?.create) {
        const created = await Payment.create({
          data: {
            userId: user.id,
            payerPhone: msisdn,
            amount,
            status: "PENDING",
            targetTier: tier, // if column exists
            mode,            // if column exists
          },
        });
        paymentId = created?.id;
        track("billing_upgrade_payment_precreate", {
          reqId,
          userId: user.id,
          paymentId: paymentId ?? null,
        });
      } else {
        track("billing_upgrade_payment_precreate_skip", { reqId, reason: "model_missing" });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[billing/upgrade] Payment pre-create skipped:", e);
      track("billing_upgrade_payment_precreate_skip", { reqId, reason: "exception" });
    }

    // --- build STK request ---
    const timestamp = yyyymmddhhmmss();
    const password = stkPassword(MPESA.SHORTCODE, MPESA.PASSKEY, timestamp);

    let token: string;
    try {
      token = await getAccessToken();
    } catch (e) {
      track("billing_upgrade_mpesa_token_error", { reqId });
      return noStore({ error: "Failed to authorize with MPesa" }, { status: 502 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const stkUrl = `${MPESA.BASE_URL}/mpesa/stkpush/v1/processrequest`;
    const res = await fetch(stkUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        BusinessShortCode: Number(MPESA.SHORTCODE),
        Password: password,
        Timestamp: timestamp,
        TransactionType: transactionType,
        Amount: amount,                 // server-trusted amount
        PartyA: msisdn,                 // customer
        PartyB: Number(MPESA.SHORTCODE),// your Paybill/Till
        PhoneNumber: msisdn,
        CallBackURL: MPESA.CALLBACK_URL,
        // Safaricom limits AccountReference (<= 12 chars typically)
        AccountReference: "QWIKSALE",
        TransactionDesc: `Upgrade ${tier}`,
      }),
    }).catch((e) => {
      clearTimeout(timeout);
      track("billing_upgrade_mpesa_request_error", { reqId, message: String(e) });
      throw e;
    });

    clearTimeout(timeout);

    const data: any = await res.json().catch(() => ({}));

    // --- persist STK IDs back to Payment (best effort) ---
    try {
      if (paymentId && (prisma as any).payment?.update) {
        await (prisma as any).payment.update({
          where: { id: paymentId },
          data: {
            checkoutRequestId: data?.CheckoutRequestID ?? null,
            merchantRequestId: data?.MerchantRequestID ?? null,
            // optionally: rawResponse: JSON.stringify(data)
          },
        });
        track("billing_upgrade_payment_postupdate", {
          reqId,
          paymentId,
          hasCheckoutId: !!data?.CheckoutRequestID,
          hasMerchantId: !!data?.MerchantRequestID,
        });
      } else {
        track("billing_upgrade_payment_postupdate_skip", {
          reqId,
          paymentId: paymentId ?? null,
          reason: "model_missing_or_no_id",
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[billing/upgrade] Payment post-update skipped:", e);
      track("billing_upgrade_payment_postupdate_skip", { reqId, paymentId: paymentId ?? null, reason: "exception" });
    }

    // --- error from MPesa ---
    if (!res.ok) {
      track("billing_upgrade_mpesa_error", {
        reqId,
        userId: user.id,
        paymentId: paymentId ?? null,
        status: res.status,
        code: data?.ResponseCode ?? null,
      });
      return noStore(
        {
          ok: false,
          error: data?.errorMessage || data?.ResponseDescription || "MPesa request failed",
          mpesa: data || null,
          paymentId: paymentId ?? null,
          deduped: Boolean(existingPending),
        },
        { status: res.status }
      );
    }

    // --- success ---
    track("billing_upgrade_mpesa_success", {
      reqId,
      userId: user.id,
      paymentId: paymentId ?? null,
      code: data?.ResponseCode ?? null,
    });

    return noStore({
      ok: true,
      tier,
      amount,
      mode,
      message: data?.CustomerMessage || "STK push sent. Confirm on your phone.",
      mpesa: {
        MerchantRequestID: data?.MerchantRequestID,
        CheckoutRequestID: data?.CheckoutRequestID,
        ResponseCode: data?.ResponseCode,
        ResponseDescription: data?.ResponseDescription,
        CustomerMessage: data?.CustomerMessage,
      },
      paymentId: paymentId ?? null,
      deduped: Boolean(existingPending),
    });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[billing/upgrade] error:", e);
    track("billing_upgrade_error", { reqId, message: e?.message ?? String(e) });
    return noStore({ error: e?.message || "Server error" }, { status: 500 });
  }
}


