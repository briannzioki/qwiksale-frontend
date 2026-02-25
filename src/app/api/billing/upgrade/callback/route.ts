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
  // Format: YYYYMMDDHHmmss (Safaricom timestamp is typically local EAT time)
  const s = String(n || "");
  if (!/^\d{14}$/.test(s)) return null;

  const y = s.slice(0, 4);
  const mo = s.slice(4, 6);
  const d = s.slice(6, 8);
  const hh = s.slice(8, 10);
  const mm = s.slice(10, 12);
  const ss = s.slice(12, 14);

  // Interpret as Africa/Nairobi (+03:00), then let JS convert to UTC internally.
  const dt = new Date(`${y}-${mo}-${d}T${hh}:${mm}:${ss}+03:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

function cmGet(meta: StkCallback["CallbackMetadata"], key: string) {
  const items = meta?.Item || [];
  const found = items.find((i) => i?.Name === key);
  return found?.Value;
}

function inferTierFromAmount(amount: unknown): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  if (n === 199) return "GOLD";
  if (n === 499) return "PLATINUM";
  return "";
}

async function bestEffortUpgradeUserTier(userId: string, tier: string) {
  // try common column names; ignore failures
  const candidates: Array<Record<string, any>> = [
    { subscription: tier }, // ✅ your UI reads user.subscription
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

/** Find payment best-effort: include targetTier only if Prisma supports it. */
async function findPaymentBestEffort(or: Array<Record<string, string>>) {
  const Payment = (prisma as any).payment;
  if (!Payment?.findFirst) return null;

  try {
    return await Payment.findFirst({
      where: { OR: or },
      select: {
        id: true,
        userId: true,
        status: true,
        amount: true,
        payerPhone: true,
        targetTier: true,
      },
    });
  } catch {
    return await Payment.findFirst({
      where: { OR: or },
      select: {
        id: true,
        userId: true,
        status: true,
        amount: true,
        payerPhone: true,
      },
    });
  }
}

/** Update payment best-effort: select targetTier only if Prisma supports it. */
async function updatePaymentBestEffort(paymentId: string, data: Record<string, any>) {
  const Payment = (prisma as any).payment;
  if (!Payment?.update) return null;

  try {
    return await Payment.update({
      where: { id: paymentId },
      data,
      select: { id: true, userId: true, status: true, targetTier: true },
    });
  } catch {
    return await Payment.update({
      where: { id: paymentId },
      data,
      select: { id: true, userId: true, status: true },
    });
  }
}

export async function POST(req: Request) {
  try {
    // --- optional shared-secret check ---
    if (CALLBACK_TOKEN) {
      const tok = req.headers.get("x-callback-token") || req.headers.get("x-callback-secret") || "";
      if (tok.trim() !== CALLBACK_TOKEN) {
        // keep 200 to avoid retry storms if token config is wrong
        return noStore({ ok: true, note: "Forbidden" }, { status: 200 });
      }
    }

    // --- parse body (Safaricom posts JSON) ---
    let body: any;
    try {
      body = await req.json();
    } catch {
      return noStore({ ok: true, note: "Invalid JSON" }, { status: 200 });
    }

    const stk: StkCallback | undefined = body?.Body?.stkCallback;
    if (!stk) {
      return noStore({ ok: true, note: "Malformed payload" }, { status: 200 });
    }

    const checkoutId = String(stk.CheckoutRequestID ?? "").trim();
    const merchantId = String(stk.MerchantRequestID ?? "").trim();
    const resultCode = typeof stk.ResultCode === "number" ? stk.ResultCode : Number(stk.ResultCode);
    const resultDesc = String(stk.ResultDesc ?? "").trim();
    const meta = stk.CallbackMetadata;

    if (!checkoutId && !merchantId) {
      return noStore({ ok: true, note: "Missing IDs" }, { status: 200 });
    }

    const amount = Number(cmGet(meta, "Amount"));
    const phoneFromCb = String(cmGet(meta, "PhoneNumber") ?? "").trim();
    const receipt = String(cmGet(meta, "MpesaReceiptNumber") ?? "").trim();
    const txnDateRaw = cmGet(meta, "TransactionDate");
    const paidAt = parseSafaricomDate(txnDateRaw) || new Date();

    const or: Array<Record<string, string>> = [];
    if (checkoutId) or.push({ checkoutRequestId: checkoutId });
    if (merchantId) or.push({ merchantRequestId: merchantId });

    let payment: any = null;
    try {
      payment = await findPaymentBestEffort(or);
    } catch {
      payment = null;
    }

    if (!payment) {
      // eslint-disable-next-line no-console
      console.warn("[billing/upgrade/callback] Payment not found for", {
        CheckoutRequestID: checkoutId || null,
        MerchantRequestID: merchantId || null,
      });
      return noStore({ ok: true, note: "Payment not found (ack)" }, { status: 200 });
    }

    // --- idempotency: already terminal -> do nothing ---
    if (payment.status === "PAID" || payment.status === "FAILED") {
      return noStore({ ok: true, idempotent: true }, { status: 200 });
    }

    const success = Number(resultCode) === 0;

    // keep payerPhone valid (schema requires it)
    const payerPhone = phoneFromCb || payment.payerPhone;

    // optional: warn if amount mismatches expected
    if (success && Number.isFinite(amount) && payment.amount != null && Number(payment.amount) !== Number(amount)) {
      // eslint-disable-next-line no-console
      console.warn("[billing/upgrade/callback] Amount mismatch", {
        paymentId: payment.id,
        expected: payment.amount,
        got: amount,
      });
    }

    // Only write columns that exist in your schema (no resultCode)
    const updateData = {
      status: success ? "PAID" : "FAILED",
      payerPhone,
      paidAt: success ? paidAt : null,
      mpesaReceipt: success && receipt ? receipt : null,
      resultDesc: resultDesc || (success ? "OK" : "FAILED"),
      rawCallback: body,
    };

    const updated: any = await updatePaymentBestEffort(payment.id, updateData);

    // --- upgrade user tier ONLY on confirmed success ---
    if (success && (updated?.userId || payment?.userId)) {
      const tierFromRow = String((updated as any)?.targetTier ?? (payment as any)?.targetTier ?? "")
        .toUpperCase()
        .trim();

      const tier = tierFromRow || inferTierFromAmount(payment.amount);

      if (tier) {
        await bestEffortUpgradeUserTier(String(updated?.userId ?? payment.userId), tier).catch(() => {});
      }
    }

    return noStore(
      {
        ok: true,
        result: { code: Number.isFinite(resultCode) ? resultCode : null, desc: resultDesc || null },
        paymentId: updated?.id ?? payment.id,
        status: updated?.status ?? (success ? "PAID" : "FAILED"),
      },
      { status: 200 },
    );
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[billing/upgrade/callback] error:", e);
    // keep 200 so Safaricom doesn’t spam retries
    return noStore({ ok: true, note: "Handled with error", error: e?.message ?? "error" }, { status: 200 });
  }
}