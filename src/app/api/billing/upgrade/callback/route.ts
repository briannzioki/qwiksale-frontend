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

export async function POST(req: Request) {
  try {
    // --- optional shared-secret check ---
    if (CALLBACK_TOKEN) {
      const tok =
        req.headers.get("x-callback-token") ||
        req.headers.get("x-callback-secret") ||
        "";
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

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = stk;

    if (!CheckoutRequestID && !MerchantRequestID) {
      return noStore({ error: "Missing IDs" }, { status: 400 });
    }

    // --- extract metadata ---
    const amount = Number(cmGet(CallbackMetadata, "Amount") || 0) || null;
    const phone = String(cmGet(CallbackMetadata, "PhoneNumber") || "") || null;
    const receipt = String(cmGet(CallbackMetadata, "MpesaReceiptNumber") || "") || null;
    const txnDateRaw = cmGet(CallbackMetadata, "TransactionDate");
    const paidAt = parseSafaricomDate(txnDateRaw) || new Date();

    // --- find payment record ---
    const Payment = (prisma as any).payment;
    if (!Payment?.findFirst) {
      // If you don't have a Payment model, just acknowledge to MPesa
      return noStore({ ok: true, note: "Payments not supported" });
    }

    const payment =
      (await Payment.findFirst({
        where: {
          OR: [
            { checkoutRequestId: CheckoutRequestID || "" },
            { merchantRequestId: MerchantRequestID || "" },
          ],
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
      // Still ack success so MPesa doesn't retry forever; you can alert/log
      // eslint-disable-next-line no-console
      console.warn("[mpesa/callback] Payment not found for", {
        CheckoutRequestID,
        MerchantRequestID,
      });
      return noStore({ ok: true, note: "Payment not found (ack)" });
    }

    // --- idempotency: if already terminal, do nothing ---
    if (payment.status === "SUCCESS" || payment.status === "FAILED") {
      return noStore({ ok: true, idempotent: true });
    }

    const success = ResultCode === 0;

    // --- update payment status & details ---
    const updated = await Payment.update({
      where: { id: payment.id },
      data: {
        status: success ? "SUCCESS" : "FAILED",
        payerPhone: phone,
        paidAt: success ? paidAt : null,
        receipt: receipt,
        resultCode: ResultCode ?? null,
        resultDesc: ResultDesc ?? null,
        rawCallback: JSON.stringify(body), // optional JSON column
      },
      select: {
        id: true,
        userId: true,
        status: true,
        amount: true,
        targetTier: true,
      },
    });

    // --- (best-effort) upgrade user tier on SUCCESS ---
    if (success && updated.userId) {
      try {
        // If you store a subscription/tier on User (e.g. user.tier):
        await prisma.user.update({
          where: { id: updated.userId },
          data: {
            // Adjust this to your schema. Examples:
            // tier: updated.targetTier ?? "GOLD",
            // plan: updated.targetTier ?? "GOLD",
            // subscriptionLevel: updated.targetTier ?? "GOLD",
          } as any,
        });
      } catch {
        // ignore if column absent
      }
    }

    // MPesa expects 200 OK; we echo minimal info
    return noStore({
      ok: true,
      result: { code: ResultCode, desc: ResultDesc },
      paymentId: updated.id,
      status: updated.status,
    });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[billing/upgrade/callback] error:", e);
    // Still return 200 so MPesa doesn’t spam retries, but include error note
    return noStore({ ok: true, note: "Handled with error", error: e?.message ?? "error" });
  }
}
