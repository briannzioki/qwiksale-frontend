// src/app/api/mpesa/stk/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { logMpesaBootOnce, normalizeMsisdn, stkPush } from "@/app/lib/mpesa";

type Body = {
  amount: number;
  msisdn: string;                 // accepts 07/01/+254/254 forms
  mode?: "till" | "paybill";
  productId?: string;             // optional linkage
  userId?: string;                // optional linkage
  accountRef?: string;            // optional override (<=12)
  description?: string;           // optional override (<=32)
};

function json(body: unknown, init: ResponseInit = {}) {
  const res = new NextResponse(JSON.stringify(body), init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Content-Type", "application/json; charset=utf-8");
  return res;
}

export async function POST(req: Request) {
  try {
    logMpesaBootOnce();

    let parsed: Body;
    try {
      parsed = (await req.json()) as Body;
    } catch {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const amount = Math.round(Number(parsed?.amount));
    if (!Number.isFinite(amount) || amount < 1) {
      return json({ error: "Invalid amount (min 1 KES)" }, { status: 400 });
    }

    const phone = normalizeMsisdn(String(parsed?.msisdn ?? ""));
    if (!/^254(7|1)\d{8}$/.test(phone)) {
      return json({ error: "Invalid msisdn (use 2547XXXXXXXX or 2541XXXXXXXX)" }, { status: 400 });
    }

    const accountRef = (parsed?.accountRef ?? "Qwiksale").slice(0, 12);
    const description = (parsed?.description ?? "Qwiksale payment").slice(0, 32);

    // 1) Create a PENDING row *before* calling LNMO
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

    // 2) Call LNMO
    const data = await stkPush({
      amount,
      phone,
      accountReference: accountRef,
      description,
      mode: parsed?.mode,
    });

    // 3) Upsert by CheckoutRequestID (handles race if callback arrived first)
    const saved = await prisma.payment.upsert({
      where: { checkoutRequestId: data.CheckoutRequestID },
      update: {
        merchantRequestId: data.MerchantRequestID,
      },
      create: {
        status: "PENDING",
        method: "MPESA",
        currency: "KES",
        amount,
        payerPhone: phone,
        accountRef,
        checkoutRequestId: data.CheckoutRequestID,
        merchantRequestId: data.MerchantRequestID,
        productId: parsed?.productId ?? null,
        userId: parsed?.userId ?? null,
      },
      select: { id: true },
    });

    // 4) If a different row was upserted (because callback created it first),
    //    delete the extra pending row to avoid duplicates.
    if (saved.id !== pending.id) {
      await prisma.payment.delete({ where: { id: pending.id } }).catch(() => {});
    }

    return json({ ok: true, ...data }, { status: 200 });
  } catch (e: any) {
    console.warn("[mpesa] /api/mpesa/stk error:", e?.message || e);
    return json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function GET() {
  return json({ status: "stk alive" }, { status: 200 });
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
