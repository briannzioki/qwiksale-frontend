// src/app/lib/mpesa.ts
import "server-only";
import { mpesa as ENV, isDev } from "./env";

/* ------------------------------------------------------------------ */
/* --------------------------- Public Config ------------------------- */
/* ------------------------------------------------------------------ */

export const MPESA = {
  ENV: ENV.environment, // "sandbox" | "production"
  BASE_URL: ENV.baseUrl, // https://sandbox.safaricom.co.ke | https://api.safaricom.co.ke
  SHORTCODE: ENV.shortCode, // Paybill or Till number
  PASSKEY: ENV.passkey, // LNMO passkey
  CALLBACK_URL: ENV.callbackUrl,
  MODE: ENV.mode, // "till" | "paybill"
} as const;

export function logMpesaBootOnce() {
  if (!isDev) return;
  const FLAG = "__MPESA_BOOT_LOGGED__";
  // @ts-ignore
  if (globalThis[FLAG]) return;
  // @ts-ignore
  globalThis[FLAG] = true;
  console.info(
    `[mpesa] boot → env=${MPESA.ENV} base=${MPESA.BASE_URL} shortcode=${MPESA.SHORTCODE} callback=${MPESA.CALLBACK_URL} mode=${MPESA.MODE}`,
  );
}

/* ------------------------------------------------------------------ */
/* ------------------------------ Utils ------------------------------ */
/* ------------------------------------------------------------------ */

const DEFAULT_TIMEOUT_MS = 12_000;

// SAFE DEFAULTS:
// - Token fetch can retry.
// - STK push should NOT retry by default (not idempotent).
const DEFAULT_TOKEN_RETRIES = 2;
const DEFAULT_STK_RETRIES = 0;

const BACKOFF_CAP_MS = 8_000;
const TOKEN_SKEW_MS = 30_000; // refresh token a bit early

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
  // expects 12 digits
  return msisdn.replace(/^(\d{6})\d{3}(\d{3})$/, "$1***$2");
}

function isNetworkishError(e: unknown): boolean {
  // fetch failures / timeouts often come as TypeError / AbortError
  const msg = String((e as any)?.message ?? "");
  const name = String((e as any)?.name ?? "");
  if (name === "AbortError") return true;
  if (e instanceof TypeError) return true;
  return /network|fetch|timed out|ECONN|ENOTFOUND/i.test(msg);
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

function stripTrailingSlash(u: string) {
  return u.replace(/\/+$/, "");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ------------------------------------------------------------------ */
/* --------------------------- Token (OAuth) ------------------------- */
/* ------------------------------------------------------------------ */

export class MpesaError extends Error {
  code?: string | number;
  status?: number;
  data?: any;

  constructor(
    message: string,
    opts: { code?: string | number; status?: number; data?: any } = {},
  ) {
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

type TokenResponse = { access_token?: string; expires_in?: string | number };

type TokenCache = {
  token?: string;
  expiresAt?: number; // epoch ms
  inflight?: Promise<string>;
};

function getTokenCache(): TokenCache {
  const g = globalThis as unknown as { __QS_MPESA_TOKEN__?: TokenCache };
  if (!g.__QS_MPESA_TOKEN__) g.__QS_MPESA_TOKEN__ = {};
  return g.__QS_MPESA_TOKEN__;
}

function isTokenValid(cache: TokenCache) {
  if (!cache.token || !cache.expiresAt) return false;
  return Date.now() + TOKEN_SKEW_MS < cache.expiresAt;
}

async function fetchAccessToken(opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<{
  token: string;
  expiresAt: number;
}> {
  const key = ENV.consumerKey;
  const secret = ENV.consumerSecret;

  if (!key || !secret) throw new MpesaError("Missing MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET");
  if (!MPESA.BASE_URL) throw new MpesaError("Missing MPESA BASE_URL");

  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const base = stripTrailingSlash(MPESA.BASE_URL);
  const url = `${base}/oauth/v1/generate?grant_type=client_credentials`;

  const t = withTimeout(opts?.signal, opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
      signal: t.signal,
    });

    const body = (await parseJsonSafe<TokenResponse>(r)) ?? {};
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

    const expRaw = (body as any)?.expires_in;
    const expSec = typeof expRaw === "number" ? expRaw : Number(String(expRaw ?? "0"));
    const safeExpSec = Number.isFinite(expSec) && expSec > 0 ? expSec : 3599;

    return { token: String(token), expiresAt: Date.now() + safeExpSec * 1000 };
  } finally {
    t.done();
  }
}

/** OAuth token from Daraja (with caching + retries/backoff) */
export async function getAccessToken(opts?: {
  retries?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  forceRefresh?: boolean;
}) {
  const cache = getTokenCache();

  if (!opts?.forceRefresh && isTokenValid(cache)) {
    return cache.token as string;
  }

  if (cache.inflight) {
    return await cache.inflight;
  }

  const retries = Math.max(0, opts?.retries ?? DEFAULT_TOKEN_RETRIES);
  let attempt = 0;

  cache.inflight = (async () => {
    while (true) {
      try {
        const tokOpts: { timeoutMs?: number; signal?: AbortSignal } = {};
        if (opts?.timeoutMs !== undefined) tokOpts.timeoutMs = opts.timeoutMs;
        if (opts?.signal) tokOpts.signal = opts.signal;

        const got = await fetchAccessToken(tokOpts);

        cache.token = got.token;
        cache.expiresAt = got.expiresAt;
        return got.token;
      } catch (e) {
        attempt += 1;
        if (attempt > retries) throw e;

        const delay = Math.min(1000 * Math.pow(2, attempt - 1), BACKOFF_CAP_MS);
        await sleep(delay);
      }
    }
  })();

  try {
    return await cache.inflight;
  } finally {
    // exactOptionalPropertyTypes-safe: remove the optional prop instead of assigning undefined
    delete cache.inflight;
  }
}

/* ------------------------------------------------------------------ */
/* ----------------------------- STK Push ---------------------------- */
/* ------------------------------------------------------------------ */

type StkPushInput = {
  amount: number; // KES
  phone: string; // can be raw; will be normalized
  accountReference?: string;
  description?: string;
  mode?: "till" | "paybill"; // override txn mode if needed
  signal?: AbortSignal;
  timeoutMs?: number;

  // Token retrieval retries are safe
  tokenRetries?: number;

  // STK retries are NOT safe by default (not idempotent)
  requestRetries?: number;

  // Optional correlation id for logs (won't be sent to Safaricom)
  requestId?: string;
};

export type StkPushResponse = {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string | "0";
  ResponseDescription: string;
  CustomerMessage: string;
};

function mkReqId() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = globalThis.crypto as any;
    return (
      c?.randomUUID?.() ??
      `qs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    );
  } catch {
    return `qs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

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
    tokenRetries = DEFAULT_TOKEN_RETRIES,
    requestRetries = DEFAULT_STK_RETRIES,
    requestId = mkReqId(),
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

  // normalized/definite values (no undefineds)
  const useMode = mode || MPESA.MODE || "paybill";
  const transactionType = useMode === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";

  const shortcode = String(MPESA.SHORTCODE);
  const timestamp = yyyymmddhhmmss();
  const password = stkPassword(shortcode, MPESA.PASSKEY, timestamp);

  const token = await getAccessToken({
    retries: tokenRetries,
    timeoutMs,
    ...(signal ? { signal } : {}),
  });

  const amt = Math.round(amount);

  // dev-only masked log
  if (isDev) {
    console.info(
      `[mpesa] STK(${requestId}) → env=${MPESA.ENV} type=${transactionType} shortcode=${shortcode} amount=${amt} msisdn=${maskMsisdn(
        msisdn,
      )}`,
    );
  }

  const partyA = Number(msisdn);
  const partyB = Number(shortcode);
  const phoneNum = Number(msisdn);
  const cbUrl = String(MPESA.CALLBACK_URL);

  // Daraja limits:
  const acctRef = String(accountReference ?? "").trim().slice(0, 12) || "Qwiksale";
  const txnDesc = String(description ?? "").trim().slice(0, 32) || "Qwiksale payment";

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

  const url = `${stripTrailingSlash(MPESA.BASE_URL)}/mpesa/stkpush/v1/processrequest`;

  let attempt = 0;
  const maxAttempts = Math.max(0, requestRetries) + 1;

  while (attempt < maxAttempts) {
    attempt += 1;

    const t = withTimeout(signal, timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: t.signal,
        cache: "no-store",
      });

      const data = (await parseJsonSafe<any>(res)) ?? {};
      const ok = (data as any)?.ResponseCode === "0" || (data as any)?.ResponseCode === 0;

      if (!res.ok || !ok) {
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
        if (typeof maybeCode === "string" || typeof maybeCode === "number") errOpts.code = maybeCode;

        throw new MpesaError(`STK push failed: ${String(msg)}`, errOpts);
      }

      return {
        MerchantRequestID: String((data as any).MerchantRequestID),
        CheckoutRequestID: String((data as any).CheckoutRequestID),
        ResponseCode: String((data as any).ResponseCode),
        ResponseDescription: String((data as any).ResponseDescription),
        CustomerMessage: String((data as any).CustomerMessage),
      };
    } catch (e) {
      // IMPORTANT:
      // STK push is not idempotent. Only retry if user explicitly opted-in via requestRetries,
      // and only for obvious network/timeout errors.
      const canRetry = attempt < maxAttempts && isNetworkishError(e);
      if (!canRetry) throw e;

      const delay = Math.min(1000 * Math.pow(2, attempt - 1), BACKOFF_CAP_MS);
      if (isDev)
        console.warn(
          `[mpesa] STK(${requestId}) retrying after ${delay}ms (attempt ${attempt}/${maxAttempts})`,
        );
      await sleep(delay);
    } finally {
      t.done();
    }
  }

  throw new MpesaError("STK push failed after retries");
}
