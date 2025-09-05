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

/* ---------------- analytics (console-only for now) ---------------- */
type AnalyticsEvent =
  | "mpesa_stk_initiate_attempt"
  | "mpesa_stk_initiate_invalid_json"
  | "mpesa_stk_initiate_invalid_amount"
  | "mpesa_stk_initiate_invalid_msisdn"
  | "mpesa_stk_initiate_config_missing"
  | "mpesa_stk_initiate_callback_insecure"
  | "mpesa_stk_initiate_network_error"
  | "mpesa_stk_initiate_success"
  | "mpesa_stk_initiate_error"
  | "mpesa_stk_initiate_ping";

function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  try {
    // eslint-disable-next-line no-console
    console.log(`[track] ${event}`, { ts: new Date().toISOString(), ...props });
  } catch {
    /* no-op */
  }
}

type Mode = "paybill" | "till";
type Body = {
  amount: number;
  msisdn: string;       // accepts 07/01/+254/254
  mode?: Mode;
  accountRef?: string;  // optional override (<=12)
  description?: string; // optional override (<=32)
};

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function normalizeMode(m?: string): Mode {
  return m === "till" ? "till" : "paybill";
}

function ensureHttps(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    logMpesaBootOnce();

    // ---- parse body ---------------------------------------------------------
    let parsed: Body;
    try {
      parsed = (await req.json()) as Body;
    } catch {
      track("mpesa_stk_initiate_invalid_json", { reqId });
      return noStore({ error: "Invalid JSON body" }, { status: 400 });
    }

    // ---- validate inputs ----------------------------------------------------
    const amount = Math.round(Number(parsed?.amount));
    if (!Number.isFinite(amount) || amount < 1) {
      track("mpesa_stk_initiate_invalid_amount", { reqId, amount });
      return noStore({ error: "Invalid amount (min 1 KES)" }, { status: 400 });
    }

    const phone = normalizeMsisdn(String(parsed?.msisdn ?? ""));
    if (!/^254(7|1)\d{8}$/.test(phone)) {
      track("mpesa_stk_initiate_invalid_msisdn", { reqId });
      return noStore(
        { error: "Invalid msisdn (use 2547XXXXXXXX or 2541XXXXXXXX)" },
        { status: 400 }
      );
    }

    const mode = normalizeMode(parsed?.mode);
    const accountRef = (parsed?.accountRef ?? "QWIKSALE").toString().slice(0, 12);
    const description = (parsed?.description ?? "Qwiksale payment").toString().slice(0, 32);

    // ---- validate env/config ------------------------------------------------
    if (!MPESA.SHORTCODE || !MPESA.PASSKEY || !MPESA.CALLBACK_URL) {
      track("mpesa_stk_initiate_config_missing", { reqId });
      return noStore(
        { error: "M-Pesa config missing (SHORTCODE/PASSKEY/CALLBACK_URL)" },
        { status: 500 }
      );
    }
    if (!ensureHttps(MPESA.CALLBACK_URL)) {
      track("mpesa_stk_initiate_callback_insecure", { reqId });
      return noStore({ error: "CALLBACK_URL must be HTTPS" }, { status: 500 });
    }

    const shortcode = String(MPESA.SHORTCODE);
    const timestamp = yyyymmddhhmmss();
    const password = stkPassword(shortcode, MPESA.PASSKEY, timestamp);
    const token = await getAccessToken();
    const transactionType =
      mode === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";

    track("mpesa_stk_initiate_attempt", {
      reqId,
      env: MPESA.ENV,
      mode,
      accountRefLength: accountRef.length,
      descriptionLength: description.length,
      amount,
    });

    // ---- safe log (mask phone) ---------------------------------------------
    const masked = phone.replace(/^(\d{6})\d{3}(\d{3})$/, "$1***$2");
    // eslint-disable-next-line no-console
    console.info(
      `[mpesa] STK initiate → env=${MPESA.ENV} type=${transactionType} shortcode=${shortcode} amount=${amount} msisdn=${masked}`
    );

    // ---- build request ------------------------------------------------------
    const payload = {
      BusinessShortCode: Number(shortcode),
      Password: password,
      Timestamp: timestamp,
      TransactionType: transactionType,
      Amount: amount,
      PartyA: Number(phone),
      PartyB: Number(shortcode),
      PhoneNumber: Number(phone),
      CallBackURL: MPESA.CALLBACK_URL,
      AccountReference: accountRef,
      TransactionDesc: description,
    };

    // ---- network with timeout ----------------------------------------------
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);

    const res = await fetch(`${MPESA.BASE_URL}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).catch((e) => {
      track("mpesa_stk_initiate_network_error", { reqId, message: String(e) });
      throw new Error(`Network error: ${e?.message || e}`);
    });

    clearTimeout(timer);

    // Try JSON; fall back to text
    let data: any = {};
    try {
      data = await res.json();
    } catch {
      data = { raw: await res.text().catch(() => "") };
    }

    // Safaricom success is ResponseCode "0"
    const ok = data?.ResponseCode === "0" || data?.ResponseCode === 0;
    const message =
      data?.CustomerMessage ||
      (ok ? "STK push sent. Confirm on your phone." : data?.ResponseDescription || "STK failed");

    if (ok) {
      track("mpesa_stk_initiate_success", {
        reqId,
        code: data?.ResponseCode ?? null,
        hasCheckoutId: !!data?.CheckoutRequestID,
        hasMerchantId: !!data?.MerchantRequestID,
      });
    }

    return noStore(
      {
        ok,
        message,
        mpesa: {
          MerchantRequestID: data?.MerchantRequestID ?? null,
          CheckoutRequestID: data?.CheckoutRequestID ?? null,
          ResponseCode: data?.ResponseCode ?? null,
          ResponseDescription: data?.ResponseDescription ?? null,
          CustomerMessage: data?.CustomerMessage ?? null,
        },
        // echo (helpful for debugging client flows)
        env: MPESA.ENV,
        mode,
      },
      { status: res.status }
    );
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn("[mpesa] STK initiate error:", e?.message || e);
    track("mpesa_stk_initiate_error", { reqId, message: e?.message ?? String(e) });
    return noStore({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function GET() {
  track("mpesa_stk_initiate_ping", { method: "GET" });
  return noStore({ status: "stk-initiate alive" }, { status: 200 });
}

export async function HEAD() {
  track("mpesa_stk_initiate_ping", { method: "HEAD" });
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
