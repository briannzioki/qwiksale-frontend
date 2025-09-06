// src/app/api/mpesa/callback/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

type MpesaItem = { Name: string; Value?: string | number };
type MpesaCallback = {
  ResultCode: number;
  ResultDesc?: string;
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  CallbackMetadata?: { Item?: MpesaItem[] };
};

function json(body: unknown, init: ResponseInit = {}) {
  const res = new NextResponse(JSON.stringify(body), init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Content-Type", "application/json; charset=utf-8");
  return res;
}

function itemsToMap(items: MpesaItem[] = []) {
  const out: Record<string, string | number> = {};
  for (const i of items) if (i?.Name) out[i.Name] = i.Value as any;
  return out;
}

function parseMpesaTimestamp(v: unknown): Date | undefined {
  const s = String(v || "");
  if (!/^\d{14}$/.test(s)) return undefined;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  const hh = Number(s.slice(8, 10));
  const mm = Number(s.slice(10, 12));
  const ss = Number(s.slice(12, 14));
  return new Date(y, m, d, hh, mm, ss);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const cb: MpesaCallback | undefined = (body as any)?.Body?.stkCallback;

    // Always ACK quickly
    if (!cb) {
      console.warn("[mpesa] missing stkCallback", body);
      return json({ ok: true }, { status: 200 });
    }

    const {
      ResultCode,
      ResultDesc,
      MerchantRequestID,
      CheckoutRequestID,
      CallbackMetadata,
    } = cb;

    const meta = itemsToMap(CallbackMetadata?.Item);
    const amount =
      typeof meta["Amount"] === "number" ? Math.round(meta["Amount"]) : undefined;
    const receipt =
      meta["MpesaReceiptNumber"] != null ? String(meta["MpesaReceiptNumber"]) : undefined;
    const phone =
      meta["PhoneNumber"] != null ? String(meta["PhoneNumber"]) : undefined;
    const paidAt = parseMpesaTimestamp(meta["TransactionDate"]);
    const status = Number(ResultCode) === 0 ? "PAID" : "FAILED";

    // Build patch with only defined fields
    const patch: any = { status, rawCallback: body };
    if (amount !== undefined) patch.amount = amount;
    if (phone) patch.payerPhone = phone;
    if (paidAt) patch.paidAt = paidAt;
    if (CheckoutRequestID) patch.checkoutRequestId = CheckoutRequestID;
    if (MerchantRequestID) patch.merchantRequestId = MerchantRequestID;
    if (receipt) patch.mpesaReceipt = receipt;

    try {
      if (CheckoutRequestID) {
        await prisma.payment.upsert({
          where: { checkoutRequestId: CheckoutRequestID },
          create: {
            status,
            method: "MPESA",
            currency: "KES",
            amount: amount ?? 0,
            payerPhone: phone ?? "",
            rawCallback: body,
            checkoutRequestId: CheckoutRequestID,
            merchantRequestId: MerchantRequestID ?? null,
            mpesaReceipt: receipt ?? null,
            paidAt: paidAt ?? new Date(),
          },
          update: patch,
        });
        return json({ ok: true, status, resultDesc: ResultDesc ?? null }, { status: 200 });
      }

      if (MerchantRequestID) {
        await prisma.payment.upsert({
          where: { merchantRequestId: MerchantRequestID },
          create: {
            status,
            method: "MPESA",
            currency: "KES",
            amount: amount ?? 0,
            payerPhone: phone ?? "",
            rawCallback: body,
            merchantRequestId: MerchantRequestID,
            checkoutRequestId: CheckoutRequestID ?? null,
            mpesaReceipt: receipt ?? null,
            paidAt: paidAt ?? new Date(),
          },
          update: patch,
        });
        return json({ ok: true, status, resultDesc: ResultDesc ?? null }, { status: 200 });
      }

      if (receipt) {
        await prisma.payment.upsert({
          where: { mpesaReceipt: receipt },
          create: {
            status,
            method: "MPESA",
            currency: "KES",
            amount: amount ?? 0,
            payerPhone: phone ?? "",
            rawCallback: body,
            mpesaReceipt: receipt,
            checkoutRequestId: CheckoutRequestID ?? null,
            merchantRequestId: MerchantRequestID ?? null,
            paidAt: paidAt ?? new Date(),
          },
          update: patch,
        });
        return json({ ok: true, status, resultDesc: ResultDesc ?? null }, { status: 200 });
      }

      // As a last resort, just create a row so nothing is lost
      await prisma.payment.create({
        data: {
          status,
          method: "MPESA",
          currency: "KES",
          amount: amount ?? 0,
          payerPhone: phone ?? "",
          rawCallback: body,
          paidAt: paidAt ?? new Date(),
        },
      });
      return json({ ok: true, status, resultDesc: ResultDesc ?? null }, { status: 200 });
    } catch (dbErr) {
      console.warn("[mpesa] DB persist error:", dbErr);
      return json({ ok: true, status, resultDesc: ResultDesc ?? null }, { status: 200 });
    }
  } catch (err) {
    console.warn("[mpesa] callback parse error:", err);
    return json({ ok: true }, { status: 200 });
  }
}

export async function GET() {
  return json({ status: "callback alive" }, { status: 200 });
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
