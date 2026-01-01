// src/app/api/mpesa/stk-initiate/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { MPESA, logMpesaBootOnce, normalizeMsisdn, stkPush } from "@/app/lib/mpesa";

/* ---------------- analytics (console-only for now) ---------------- */
type AnalyticsEvent =
  | "mpesa_stk_initiate_attempt"
  | "mpesa_stk_initiate_invalid_json"
  | "mpesa_stk_initiate_invalid_amount"
  | "mpesa_stk_initiate_invalid_msisdn"
  | "mpesa_stk_initiate_config_missing"
  | "mpesa_stk_initiate_callback_insecure"
  | "mpesa_stk_initiate_push_error"
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
  msisdn: string; // accepts 07/01/+254/254
  mode?: Mode;
  accountRef?: string; // <= 12
  description?: string; // <= 32
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
        { status: 400 },
      );
    }

    const mode = normalizeMode(parsed?.mode);
    const accountRef = String(parsed?.accountRef ?? "QWIKSALE").slice(0, 12);
    const description = String(parsed?.description ?? "Qwiksale payment").slice(0, 32);

    // ---- validate env/config ------------------------------------------------
    if (!MPESA.SHORTCODE || !MPESA.PASSKEY || !MPESA.CALLBACK_URL) {
      track("mpesa_stk_initiate_config_missing", { reqId });
      return noStore(
        { error: "M-Pesa config missing (SHORTCODE/PASSKEY/CALLBACK_URL)" },
        { status: 500 },
      );
    }

    // strict in production, lenient in sandbox/dev
    if (MPESA.ENV === "production" && !ensureHttps(MPESA.CALLBACK_URL)) {
      track("mpesa_stk_initiate_callback_insecure", { reqId });
      return noStore({ error: "CALLBACK_URL must be HTTPS in production" }, { status: 500 });
    }

    track("mpesa_stk_initiate_attempt", {
      reqId,
      env: MPESA.ENV,
      mode,
      accountRefLength: accountRef.length,
      descriptionLength: description.length,
      amount,
    });

    // ---- single truth: stkPush (no duplicated Daraja request logic) ---------
    let data: any;
    try {
      data = await stkPush({
        amount,
        phone,
        mode,
        accountReference: accountRef,
        description,
      });
    } catch (e: any) {
      track("mpesa_stk_initiate_push_error", { reqId, message: String(e?.message ?? e) });
      return noStore({ ok: false, error: e?.message || "Failed to initiate STK" }, { status: 502 });
    }

    const checkoutId = String(data?.CheckoutRequestID ?? "").trim();
    const merchantId = String(data?.MerchantRequestID ?? "").trim();
    const ok = !!checkoutId;

    if (ok) {
      track("mpesa_stk_initiate_success", {
        reqId,
        hasCheckoutId: true,
        hasMerchantId: !!merchantId,
      });
    }

    return noStore(
      {
        ok,
        message: data?.CustomerMessage || "STK push sent. Confirm on your phone.",
        mpesa: {
          MerchantRequestID: merchantId || null,
          CheckoutRequestID: checkoutId || null,
          ResponseCode: data?.ResponseCode ?? null,
          ResponseDescription: data?.ResponseDescription ?? null,
          CustomerMessage: data?.CustomerMessage ?? null,
        },
        env: MPESA.ENV,
        mode,
      },
      { status: ok ? 200 : 502 },
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
