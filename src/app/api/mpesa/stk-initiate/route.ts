// src/app/api/mpesa/stk-initiate/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  getAccessToken,
  stkPassword,
  yyyymmddhhmmss,
  MPESA,
  logMpesaBootOnce,
  normalizeMsisdn,
} from "@/app/lib/mpesa";

type Mode = "paybill" | "till";
type Body = {
  amount: number;
  msisdn: string;            // accepts 07/01/+254/254 forms
  mode?: Mode;
};

function json(body: unknown, init: ResponseInit = {}) {
  const res = new NextResponse(JSON.stringify(body), init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Content-Type", "application/json; charset=utf-8");
  return res;
}

function normalizeMode(m?: string): Mode {
  return m === "till" ? "till" : "paybill";
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
    const phoneRaw = String(parsed?.msisdn ?? "");
    const phone = normalizeMsisdn(phoneRaw);
    const mode = normalizeMode(parsed?.mode);

    if (!Number.isFinite(amount) || amount < 1) {
      return json({ error: "Invalid amount (min 1 KES)" }, { status: 400 });
    }
    if (!/^254(7|1)\d{8}$/.test(phone)) {
      return json(
        { error: "Invalid msisdn (use 2547XXXXXXXX or 2541XXXXXXXX)" },
        { status: 400 }
      );
    }

    if (!MPESA.SHORTCODE || !MPESA.PASSKEY || !MPESA.CALLBACK_URL) {
      return json(
        { error: "M-Pesa config missing (SHORTCODE/PASSKEY/CALLBACK_URL)" },
        { status: 500 }
      );
    }

    const shortcode = String(MPESA.SHORTCODE);
    const timestamp = yyyymmddhhmmss();
    const password = stkPassword(shortcode, MPESA.PASSKEY, timestamp);
    const token = await getAccessToken();
    const transactionType =
      mode === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";

    // safe log (mask phone)
    const masked = phone.replace(/^(\d{6})\d{3}(\d{3})$/, "$1***$2");
    console.info(
      `[mpesa] STK initiate → env=${MPESA.ENV} type=${transactionType} shortcode=${shortcode} amount=${amount} msisdn=${masked}`
    );

    const body = {
      BusinessShortCode: Number(shortcode),
      Password: password,
      Timestamp: timestamp,
      TransactionType: transactionType,
      Amount: amount,
      PartyA: Number(phone),
      PartyB: Number(shortcode),
      PhoneNumber: Number(phone),
      CallBackURL: MPESA.CALLBACK_URL,
      AccountReference: "Qwiksale".slice(0, 12),
      TransactionDesc: "Qwiksale subscription".slice(0, 32),
    };

    const res = await fetch(`${MPESA.BASE_URL}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    // Try JSON; fall back to text to surface errors
    let data: any = {};
    try {
      data = await res.json();
    } catch {
      data = { raw: await res.text().catch(() => "") };
    }

    const ok = data?.ResponseCode === "0" || data?.ResponseCode === 0 || res.ok === true;
    return json({ ok, ...data }, { status: res.status });
  } catch (e: any) {
    console.warn("[mpesa] STK initiate error:", e?.message || e);
    return json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function GET() {
  return json({ status: "stk-initiate alive" }, { status: 200 });
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
