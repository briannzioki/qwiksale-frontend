// src/app/api/billing/upgrade/callback/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

// Optional: set MPESA_CALLBACK_TOKEN in env and configure it on the MPesa portal
const CALLBACK_TOKEN = (process.env["MPESA_CALLBACK_TOKEN"] || "").trim();

type StkCallback = {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResultCode?: number;
  ResultDesc?: string;
  CallbackMetadata?: {
    Item?: Array<{ Name?: string; Value?: any }>;
  };
};

function parseSafaricomDate(n: number | string | undefined): Date | null {
  // Format: YYYYMMDDHHmmss (e.g., 20170727102115)
  const s = String(n || "");
  if (!/^\d{14}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  const hh = Number(s.slice(8, 10));
  const mm = Number(s.slice(10, 12));
  const ss = Number(s.slice(12, 14));
  const dt = new Date(Date.UTC(y, m, d, hh, mm, ss));
  return isNaN(dt.getTime()) ? null : dt;
}

function cmGet(meta: StkCallback["CallbackMetadata"], key: string) {
  const items = meta?.Item || [];
  const found = items.find((i) => i?.Name === key);
  return found?.Value;
}

async function bestEffortUpgradeUserTier(userId: string, tier: string) {
  // try common column names; ignore failures
  const candidates: Array<Record<string, any>> = [
    { tier },
    { plan: tier },
    { subscriptionTier: tier },
    { subscriptionLevel: tier },
    { accountTier: tier },
  ];

  for (const data of candidates) {
    try {
      await prisma.user.update({ where: { id: userId }, data: data as any });
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

export async function POST(req: Request) {
  try {
    // --- optional shared-secret check ---
    if (CALLBACK_TOKEN) {
      const tok = req.headers.get("x-callback-token") || req.headers.get("x-callback-secret") || "";
      if (tok.trim() !== CALLBACK_TOKEN) {
        return noStore({ error: "Forbidden" }, { status: 403 });
      }
    }

    // --- parse body (Safaricom posts JSON) ---
    let body: any;
    try {
      body = await req.json();
    } catch {
      return noStore({ error: "Invalid JSON" }, { status: 400 });
    }

    const stk: StkCallback | undefined = body?.Body?.stkCallback;
    if (!stk) {
      return noStore({ error: "Malformed payload" }, { status: 400 });
    }

    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stk;

    if (!CheckoutRequestID && !MerchantRequestID) {
      return noStore({ error: "Missing IDs" }, { status: 400 });
    }

    const amount = Number(cmGet(CallbackMetadata, "Amount") || 0) || null;
    const phone = String(cmGet(CallbackMetadata, "PhoneNumber") || "") || null;
    const receipt = String(cmGet(CallbackMetadata, "MpesaReceiptNumber") || "") || null;
    const txnDateRaw = cmGet(CallbackMetadata, "TransactionDate");
    const paidAt = parseSafaricomDate(txnDateRaw) || new Date();

    const Payment = (prisma as any).payment;
    if (!Payment?.findFirst) {
      return noStore({ ok: true, note: "Payments not supported" }, { status: 200 });
    }

    const payment =
      (await Payment.findFirst({
        where: {
          OR: [
            CheckoutRequestID ? { checkoutRequestId: String(CheckoutRequestID) } : undefined,
            MerchantRequestID ? { merchantRequestId: String(MerchantRequestID) } : undefined,
          ].filter(Boolean),
        },
        select: {
          id: true,
          userId: true,
          status: true,
          amount: true,
          targetTier: true,
        },
      })) || null;

    if (!payment) {
      // eslint-disable-next-line no-console
      console.warn("[billing/upgrade/callback] Payment not found for", {
        CheckoutRequestID,
        MerchantRequestID,
      });
      return noStore({ ok: true, note: "Payment not found (ack)" }, { status: 200 });
    }

    // --- idempotency: already terminal -> do nothing ---
    if (payment.status === "PAID" || payment.status === "FAILED") {
      return noStore({ ok: true, idempotent: true }, { status: 200 });
    }

    const success = Number(ResultCode) === 0;

    // optional: warn if amount mismatches expected
    if (success && amount != null && payment.amount != null && Number(payment.amount) !== Number(amount)) {
      // eslint-disable-next-line no-console
      console.warn("[billing/upgrade/callback] Amount mismatch", {
        paymentId: payment.id,
        expected: payment.amount,
        got: amount,
      });
    }

    const updated = await Payment.update({
      where: { id: payment.id },
      data: {
        status: success ? "PAID" : "FAILED",
        payerPhone: phone,
        paidAt: success ? paidAt : null,
        mpesaReceipt: receipt,
        resultCode: ResultCode ?? null,
        resultDesc: ResultDesc ?? null,
        rawCallback: body, // keep as JSON if column supports it
      },
      select: {
        id: true,
        userId: true,
        status: true,
        targetTier: true,
      },
    });

    // --- upgrade user tier ONLY on confirmed success ---
    if (success && updated.userId) {
      const tier = String(updated.targetTier ?? "").toUpperCase().trim();
      if (tier) {
        await bestEffortUpgradeUserTier(String(updated.userId), tier).catch(() => {});
      }
    }

    return noStore(
      {
        ok: true,
        result: { code: ResultCode ?? null, desc: ResultDesc ?? null },
        paymentId: updated.id,
        status: updated.status,
      },
      { status: 200 },
    );
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[billing/upgrade/callback] error:", e);
    // keep 200 so Safaricom doesn’t spam retries
    return noStore(
      { ok: true, note: "Handled with error", error: e?.message ?? "error" },
      { status: 200 },
    );
  }
}
