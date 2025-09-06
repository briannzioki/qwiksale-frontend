import "server-only";
import { mpesa as ENV, isDev } from "./env";

/* ------------------------------------------------------------------ */
/* --------------------------- Public Config ------------------------- */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* ------------------------------ Utils ------------------------------ */
/* ------------------------------------------------------------------ */

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 2;
const BACKOFF_CAP_MS = 8_000;

function withTimeout(signal?: AbortSignal, ms = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

async function parseJsonSafe<T = any>(res: Response): Promise<T | { raw?: string } | null> {
  const ctype = res.headers.get("content-type") || "";
  try {
    if (ctype.includes("application/json")) return (await res.json()) as T;
    const raw = await res.text();
    return raw ? { raw } : null;
  } catch {
    return null;
  }
}

function maskMsisdn(msisdn: string) {
  return msisdn.replace(/^(\d{6})\d{3}(\d{3})$/, "$1***$2");
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

/** Normalize Kenyan MSISDN → 2547XXXXXXXX or 2541XXXXXXXX */
export function normalizeMsisdn(input: string): string {
  const d = (input || "").trim().replace(/\D+/g, "");
  if (d.startsWith("254")) return d.slice(0, 12);
  if (/^0[71]\d{8}$/.test(d)) return "254" + d.slice(1);
  if (/^[71]\d{8}$/.test(d)) return "254" + d;
  return d.slice(0, 12);
}

/* ------------------------------------------------------------------ */
/* --------------------------- Token (OAuth) ------------------------- */
/* ------------------------------------------------------------------ */

export class MpesaError extends Error {
  /** optional fields – assign only when defined (see ctor) */
  code?: string | number;
  status?: number;
  data?: any;
  constructor(message: string, opts: { code?: string | number; status?: number; data?: any } = {}) {
    super(message);
    this.name = "MpesaError";
    // With exactOptionalPropertyTypes, avoid assigning `undefined`.
    if (Object.prototype.hasOwnProperty.call(opts, "code") && opts.code !== undefined) {
      this.code = opts.code;
    }
    if (Object.prototype.hasOwnProperty.call(opts, "status") && opts.status !== undefined) {
      this.status = opts.status;
    }
    if (Object.prototype.hasOwnProperty.call(opts, "data") && opts.data !== undefined) {
      this.data = opts.data;
    }
  }
}

/** OAuth token from Daraja (with retries/backoff) */
export async function getAccessToken(opts?: { retries?: number; timeoutMs?: number; signal?: AbortSignal }) {
  const key = ENV.consumerKey;
  const secret = ENV.consumerSecret;
  if (!key || !secret) throw new MpesaError("Missing MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET");

  if (!MPESA.BASE_URL) throw new MpesaError("Missing MPESA BASE_URL");

  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const url = `${MPESA.BASE_URL}/oauth/v1/generate?grant_type=client_credentials`;

  const retries = Math.max(0, opts?.retries ?? DEFAULT_RETRIES);
  let attempt = 0;

  while (true) {
    const t = withTimeout(opts?.signal, opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Basic ${auth}` },
        cache: "no-store",
        signal: t.signal,
      });
      const body = await parseJsonSafe<{ access_token?: string }>(r);
      if (!r.ok) {
        const errOpts: { status?: number; data?: any } = { status: r.status };
        if (body !== null && body !== undefined) errOpts.data = body;
        throw new MpesaError(`M-Pesa token error ${r.status}`, errOpts);
      }
      const token = (body as any)?.access_token;
      if (!token) {
        const errOpts: { data?: any } = {};
        if (body !== null && body !== undefined) errOpts.data = body;
        throw new MpesaError("No access_token in Daraja response", errOpts);
      }
      return token as string;
    } catch (e) {
      attempt += 1;
      if (attempt > retries) throw e;
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), BACKOFF_CAP_MS);
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      t.done();
    }
  }
}

/* ------------------------------------------------------------------ */
/* ----------------------------- STK Push ---------------------------- */
/* ------------------------------------------------------------------ */

type StkPushInput = {
  amount: number;          // KES
  phone: string;           // can be raw; will be normalized
  accountReference?: string;
  description?: string;
  mode?: "till" | "paybill"; // override txn mode if needed
  signal?: AbortSignal;
  timeoutMs?: number;
  tokenRetries?: number;
  requestRetries?: number;
};

export type StkPushResponse = {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string | "0";
  ResponseDescription: string;
  CustomerMessage: string;
};

/** Canonical STK Push helper (robust) */
export async function stkPush(input: StkPushInput): Promise<StkPushResponse> {
  const {
    amount,
    phone,
    accountReference = "Qwiksale",
    description = "Qwiksale payment",
    mode,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    tokenRetries = DEFAULT_RETRIES,
    requestRetries = DEFAULT_RETRIES,
  } = input;

  if (!Number.isFinite(amount) || amount < 1) {
    throw new MpesaError("Invalid amount (min 1 KES)");
  }

  const msisdn = normalizeMsisdn(phone);
  if (!/^254(7|1)\d{8}$/.test(msisdn)) {
    throw new MpesaError("Invalid msisdn (use 2547XXXXXXXX or 2541XXXXXXXX)");
  }

  if (!MPESA.SHORTCODE || !MPESA.PASSKEY || !MPESA.CALLBACK_URL) {
    throw new MpesaError("M-Pesa config missing (SHORTCODE/PASSKEY/CALLBACK_URL)");
  }

  // ---- normalized/definite values (no undefineds) ----
  const useMode = mode || MPESA.MODE || "paybill";
  const transactionType =
    useMode === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";

  const shortcode = String(MPESA.SHORTCODE);
  const timestamp = yyyymmddhhmmss();
  const password = stkPassword(shortcode, MPESA.PASSKEY, timestamp);

  // Avoid passing { signal: undefined } into getAccessToken (exactOptionalPropertyTypes)
  const token = await getAccessToken({
    retries: tokenRetries,
    timeoutMs,
    ...(signal ? { signal } : {}),
  });

  // definite number for logs/body
  const amt = Math.round(amount);

  // dev-only masked log
  if (isDev) {
    console.info(
      `[mpesa] STK → env=${MPESA.ENV} type=${transactionType} shortcode=${shortcode} amount=${amt} msisdn=${maskMsisdn(
        msisdn
      )}`
    );
  }

  // build body with only strings/numbers – never undefined
  const partyA = Number(msisdn);
  const partyB = Number(shortcode);
  const phoneNum = Number(msisdn);
  const cbUrl = String(MPESA.CALLBACK_URL);
  const acctRef = String(accountReference ?? "").slice(0, 12);
  const txnDesc = String(description ?? "").slice(0, 32);

  const body = {
    BusinessShortCode: Number(shortcode),
    Password: String(password),
    Timestamp: String(timestamp),
    TransactionType: String(transactionType),
    Amount: amt,
    PartyA: partyA,
    PartyB: partyB,
    PhoneNumber: phoneNum,
    CallBackURL: cbUrl,
    AccountReference: acctRef,
    TransactionDesc: txnDesc,
  };

  const url = `${MPESA.BASE_URL}/mpesa/stkpush/v1/processrequest`;

  let attempt = 0;
  while (true) {
    const t = withTimeout(signal, timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: t.signal,
      });

      const data = (await parseJsonSafe<any>(res)) ?? {};
      const ok =
        (data as any)?.ResponseCode === "0" ||
        (data as any)?.ResponseCode === 0 ||
        res.ok === true;

      if (!ok) {
        const maybeCode = (data as any)?.errorCode ?? (data as any)?.ResponseCode ?? res.status;
        const msg =
          (data as any)?.errorMessage ??
          (data as any)?.ResponseDescription ??
          (data as any)?.CustomerMessage ??
          (data as any)?.raw ??
          "Unknown error";

        const errOpts: { code?: string | number; status?: number; data?: any } = {
          status: res.status,
          data,
        };
        if (typeof maybeCode === "string" || typeof maybeCode === "number") {
          errOpts.code = maybeCode; // assign only when definite
        }

        throw new MpesaError(`STK push failed: ${String(msg)}`, errOpts);
      }

      // Narrow the type on success
      return {
        MerchantRequestID: (data as any).MerchantRequestID,
        CheckoutRequestID: (data as any).CheckoutRequestID,
        ResponseCode: (data as any).ResponseCode,
        ResponseDescription: (data as any).ResponseDescription,
        CustomerMessage: (data as any).CustomerMessage,
      };
    } catch (e) {
      attempt += 1;
      if (attempt > requestRetries) throw e;
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), BACKOFF_CAP_MS);
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      t.done();
    }
  }
}
