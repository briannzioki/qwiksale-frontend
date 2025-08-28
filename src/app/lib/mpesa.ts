// src/app/lib/mpesa.ts
import "server-only";
import { mpesa as ENV, isDev } from "@/app/lib/env";

export const MPESA = {
  ENV: ENV.environment,        // "sandbox" | "production"
  BASE_URL: ENV.baseUrl,       // https://sandbox.safaricom.co.ke | https://api.safaricom.co.ke
  SHORTCODE: ENV.shortCode,    // Paybill or Till number
  PASSKEY: ENV.passkey,        // LNMO passkey
  CALLBACK_URL: ENV.callbackUrl,
  MODE: ENV.mode,              // "till" | "paybill"
} as const;

export function logMpesaBootOnce() {
  if (!isDev) return;
  const FLAG = "__MPESA_BOOT_LOGGED__";
  // @ts-ignore
  if (globalThis[FLAG]) return;
  // @ts-ignore
  globalThis[FLAG] = true;
  console.info(
    `[mpesa] boot → env=${MPESA.ENV} base=${MPESA.BASE_URL} shortcode=${MPESA.SHORTCODE} callback=${MPESA.CALLBACK_URL} mode=${MPESA.MODE}`
  );
}

/** YYYYMMDDHHmmss */
export function yyyymmddhhmmss(date = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    date.getFullYear().toString() +
    p(date.getMonth() + 1) +
    p(date.getDate()) +
    p(date.getHours()) +
    p(date.getMinutes()) +
    p(date.getSeconds())
  );
}

/** base64(ShortCode + Passkey + Timestamp) */
export function stkPassword(shortcode: string, passkey: string, timestamp: string) {
  return Buffer.from(shortcode + passkey + timestamp).toString("base64");
}

/** OAuth token from Daraja */
export async function getAccessToken() {
  const key = ENV.consumerKey;
  const secret = ENV.consumerSecret;
  if (!key || !secret) throw new Error("Missing MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET");
  if (!MPESA.BASE_URL) throw new Error("Missing MPESA BASE_URL");

  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const url = `${MPESA.BASE_URL}/oauth/v1/generate?grant_type=client_credentials`;

  const r = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`M-Pesa token error ${r.status}: ${body}`);
  }

  const j = (await r.json()) as { access_token?: string };
  if (!j?.access_token) throw new Error("No access_token in Daraja response");
  return j.access_token!;
}

/** Normalize Kenyan MSISDN → 2547XXXXXXXX or 2541XXXXXXXX */
export function normalizeMsisdn(input: string): string {
  const d = (input || "").replace(/\D+/g, "");
  if (d.startsWith("254")) return d.slice(0, 12);
  if (/^07\d{8}$/.test(d)) return "254" + d.slice(1);
  if (/^01\d{8}$/.test(d)) return "254" + d.slice(1);
  if (/^7\d{8}$/.test(d))  return "254" + d;
  if (/^1\d{8}$/.test(d))  return "254" + d;
  return d.slice(0, 12);
}

type StkPushInput = {
  amount: number;          // KES
  phone: string;           // can be raw; will be normalized
  accountReference?: string;
  description?: string;
  mode?: "till" | "paybill"; // override txn mode if needed
};

/** Canonical STK Push helper */
export async function stkPush(input: StkPushInput) {
  const {
    amount,
    phone,
    accountReference = "Qwiksale",
    description = "Qwiksale payment",
    mode,
  } = input;

  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error("Invalid amount (min 1 KES)");
  }

  const msisdn = normalizeMsisdn(phone);
  if (!/^254(7|1)\d{8}$/.test(msisdn)) {
    throw new Error("Invalid msisdn (use 2547XXXXXXXX or 2541XXXXXXXX)");
  }

  if (!MPESA.SHORTCODE || !MPESA.PASSKEY || !MPESA.CALLBACK_URL) {
    throw new Error("M-Pesa config missing (SHORTCODE/PASSKEY/CALLBACK_URL)");
  }

  const useMode = mode || MPESA.MODE || "paybill";
  const transactionType =
    useMode === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";

  const shortcode = String(MPESA.SHORTCODE);
  const timestamp = yyyymmddhhmmss();
  const password = stkPassword(shortcode, MPESA.PASSKEY, timestamp);
  const token = await getAccessToken();

  // dev-only masked log
  if (isDev) {
    const masked = msisdn.replace(/^(\d{6})\d{3}(\d{3})$/, "$1***$2");
    console.info(
      `[mpesa] STK → env=${MPESA.ENV} type=${transactionType} shortcode=${shortcode} amount=${amount} msisdn=${masked}`
    );
  }

  const body = {
    BusinessShortCode: Number(shortcode),
    Password: password,
    Timestamp: timestamp,
    TransactionType: transactionType,
    Amount: Math.round(amount),
    PartyA: Number(msisdn),
    PartyB: Number(shortcode),
    PhoneNumber: Number(msisdn),
    CallBackURL: MPESA.CALLBACK_URL,
    AccountReference: accountReference.slice(0, 12),
    TransactionDesc: description.slice(0, 32),
  };

  const res = await fetch(`${MPESA.BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let data: any = {};
  try {
    data = await res.json();
  } catch {
    data = { raw: await res.text().catch(() => "") };
  }

  const ok = data?.ResponseCode === "0" || data?.ResponseCode === 0 || res.ok === true;
  if (!ok) {
    const code = data?.errorCode ?? data?.ResponseCode ?? res.status;
    const msg =
      data?.errorMessage ?? data?.ResponseDescription ?? data?.CustomerMessage ?? data?.raw ?? "Unknown error";
    throw new Error(`STK push failed (${code}): ${msg}`);
  }

  return data as {
    MerchantRequestID: string;
    CheckoutRequestID: string;
    ResponseCode: string | "0";
    ResponseDescription: string;
    CustomerMessage: string;
  };
}
