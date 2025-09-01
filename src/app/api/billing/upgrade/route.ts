// src/app/api/billing/upgrade/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth"; // ✅ use centralized NextAuth handlers
import { getAccessToken, stkPassword, yyyymmddhhmmss, MPESA } from "@/app/lib/mpesa";
import { prisma } from "@/app/lib/prisma";

type Tier = "GOLD" | "PLATINUM";

// 🔒 Canonical server-side prices (ignore client-sent amount)
const PRICE: Record<Tier, number> = { GOLD: 199, PLATINUM: 499 };

// MSISDN normalizer: "07xxxxxxxx" -> "2547xxxxxxxx"
function normalizeMsisdn(input: string): string {
  let s = String(input || "").replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1);
  return s;
}

export async function POST(req: Request) {
  try {
    // --- Auth ---
    const session = await auth();
    const email = (session as any)?.user?.email as string | undefined;
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // --- Parse body ---
    const body = (await req.json().catch(() => ({}))) as {
      tier?: string;
      phone?: string;
      mode?: "paybill" | "till";
    };

    const rawTier = String(body?.tier || "GOLD").toUpperCase() as Tier;
    const tier: Tier = rawTier === "PLATINUM" ? "PLATINUM" : "GOLD"; // clamp to allowed values
    const msisdn = normalizeMsisdn(String(body?.phone || ""));

    const mode = (body?.mode === "till" ? "till" : "paybill") as "paybill" | "till";
    const transactionType =
      mode === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";

    if (!/^2547\d{8}$/.test(msisdn)) {
      return NextResponse.json({ error: "Invalid phone (use 2547XXXXXXXX)" }, { status: 400 });
    }

    // --- Server-side amount (ignore client override) ---
    const amount = PRICE[tier];

    // --- (Optional) dedupe recent pending attempts if Payment model exists ---
    let existingPending: any | null = null;
    try {
      if ((prisma as any).payment?.findFirst) {
        existingPending = await (prisma as any).payment.findFirst({
          where: {
            userId: user.id,
            status: "PENDING",
            // optionally add createdAt >= now-60s
          },
          orderBy: { createdAt: "desc" },
        });
      }
    } catch {
      /* noop */
    }

    // --- Pre-create Payment row (best effort) ---
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
            targetTier: tier, // optional column
            mode,            // optional column
          },
        });
        paymentId = created?.id;
      }
    } catch (e) {
      console.warn("Payment pre-create skipped:", e);
    }

    // --- Build STK request ---
    const timestamp = yyyymmddhhmmss();
    const password = stkPassword(MPESA.SHORTCODE, MPESA.PASSKEY, timestamp);
    const token = await getAccessToken();
    const stkUrl = `${MPESA.BASE_URL}/mpesa/stkpush/v1/processrequest`;

    const res = await fetch(stkUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: Number(MPESA.SHORTCODE),
        Password: password,
        Timestamp: timestamp,
        TransactionType: transactionType,
        Amount: amount,
        PartyA: msisdn,                     // customer
        PartyB: Number(MPESA.SHORTCODE),    // your Paybill/Till
        PhoneNumber: msisdn,
        CallBackURL: MPESA.CALLBACK_URL,
        AccountReference: "Qwiksale",
        TransactionDesc: `Upgrade ${tier}`,
      }),
    });

    const data = await res.json().catch(() => ({}));

    // --- Persist STK IDs back to Payment (best effort) ---
    try {
      if (paymentId && (prisma as any).payment?.update) {
        await (prisma as any).payment.update({
          where: { id: paymentId },
          data: {
            checkoutRequestId: data?.CheckoutRequestID ?? null,
            merchantRequestId: data?.MerchantRequestID ?? null,
          },
        });
      }
    } catch (e) {
      console.warn("Payment post-update skipped:", e);
    }

    // --- Respond ---
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json({
      ok: true,
      tier,
      amount,
      mode,
      message: data?.CustomerMessage || "STK push sent. Confirm payment on your phone.",
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
    console.error("POST /api/billing/upgrade error", e);
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
