// src/app/lib/mpesa.ts
import "server-only";
import { isDev, mpesa as MPESA_ENVCFG } from "./env";

/* ------------------------------------------------------------------ */
/* --------------------------- Public Config ------------------------- */
/* ------------------------------------------------------------------ */

type MpesaEnv = "sandbox" | "production";
type MpesaMode = "till" | "paybill";

function trimEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function pickNonEmpty(...vals: Array<string | undefined | null>): string {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function normEnv(v: string | undefined): MpesaEnv {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "production" ? "production" : "sandbox";
}

function stripTrailingSlash(u: string) {
  return u.replace(/\/+$/, "");
}

function baseUrlFor(env: MpesaEnv): string {
  return env === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
}

function safeLogEnabled(): boolean {
  // Default: dev logs only. In prod you must opt-in with MPESA_DEBUG=1.
  return isDev || trimEnv("MPESA_DEBUG") === "1";
}

function maskMsisdn(msisdn: string) {
  const d = String(msisdn || "").replace(/\D+/g, "");
  if (/^\d{12}$/.test(d)) return d.replace(/^(\d{6})\d{3}(\d{3})$/, "$1***$2");
  if (d.length >= 6) return `${d.slice(0, 3)}***${d.slice(-2)}`;
  return "***";
}

/** Normalize Kenyan MSISDN → 2547XXXXXXXX or 2541XXXXXXXX */
export function normalizeMsisdn(input: string): string {
  const d = (input || "").trim().replace(/\D+/g, "");
  if (d.startsWith("254")) return d.slice(0, 12);
  if (/^0[71]\d{8}$/.test(d)) return "254" + d.slice(1);
  if (/^[71]\d{8}$/.test(d)) return "254" + d;
  return d.slice(0, 12);
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

/* ------------------------------------------------------------------ */
/* ------------------------- Canonical config ------------------------ */
/* ------------------------------------------------------------------ */
/**
 * Vercel variables (per your screenshot) supported directly:
 * - MPESA_ENV
 * - MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET
 * - MPESA_PASSKEY
 * - MPESA_PAYBILL_SHORTCODE
 * - MPESA_TILL_NUMBER
 * - MPESA_CALLBACK_URL
 *
 * We still keep backwards compatibility with MPESA_SHORT_CODE / MPESA_SHORTCODE
 * and MPESA_BASE_URL / MPESA_MODE overrides.
 */

const ENV: MpesaEnv = normEnv(pickNonEmpty(trimEnv("MPESA_ENV"), MPESA_ENVCFG.environment));

const BASE_URL: string = pickNonEmpty(trimEnv("MPESA_BASE_URL"), MPESA_ENVCFG.baseUrl, baseUrlFor(ENV));

const PAYBILL_SHORTCODE: string = pickNonEmpty(
  trimEnv("MPESA_PAYBILL_SHORTCODE"),
  trimEnv("MPESA_SHORT_CODE"),
  trimEnv("MPESA_SHORTCODE"),
  MPESA_ENVCFG.shortCode,
  ENV === "sandbox" ? "174379" : "",
);

const TILL_NUMBER: string = pickNonEmpty(trimEnv("MPESA_TILL_NUMBER"));

const CALLBACK_URL: string = pickNonEmpty(trimEnv("MPESA_CALLBACK_URL"), MPESA_ENVCFG.callbackUrl);

const MODE: MpesaMode =
  (pickNonEmpty(trimEnv("MPESA_MODE"), MPESA_ENVCFG.mode) || "paybill").toLowerCase() === "till"
    ? "till"
    : "paybill";

const CONSUMER_KEY: string = pickNonEmpty(trimEnv("MPESA_CONSUMER_KEY"), MPESA_ENVCFG.consumerKey);
const CONSUMER_SECRET: string = pickNonEmpty(trimEnv("MPESA_CONSUMER_SECRET"), MPESA_ENVCFG.consumerSecret);
const PASSKEY: string = pickNonEmpty(trimEnv("MPESA_PASSKEY"), MPESA_ENVCFG.passkey);

// Hard validation only in real prod (avoid breaking local/dev by being too strict)
function isRealProd(): boolean {
  const vercelEnv = trimEnv("VERCEL_ENV");
  if (vercelEnv) return vercelEnv === "production";
  return (process.env.NODE_ENV ?? "") === "production";
}

function validateConfig() {
  // Always validate basics (throw because routes depend on this)
  if (!PAYBILL_SHORTCODE) {
    throw new Error("Missing MPESA_PAYBILL_SHORTCODE (or MPESA_SHORT_CODE/MPESA_SHORTCODE)");
  }
  if (!PASSKEY) {
    throw new Error("Missing MPESA_PASSKEY");
  }
  if (!CALLBACK_URL) {
    throw new Error("Missing MPESA_CALLBACK_URL");
  }
  if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    throw new Error("Missing MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET");
  }

  // In prod: base URL MUST match env
  if (isRealProd()) {
    const base = BASE_URL.toLowerCase();
    if (ENV === "sandbox" && !base.includes("sandbox.safaricom.co.ke")) {
      throw new Error(`MPESA_ENV=sandbox but MPESA_BASE_URL is not sandbox.safaricom.co.ke (${BASE_URL})`);
    }
    if (ENV === "production" && !base.includes("api.safaricom.co.ke")) {
      throw new Error(`MPESA_ENV=production but MPESA_BASE_URL is not api.safaricom.co.ke (${BASE_URL})`);
    }
  }
}

validateConfig();

export const MPESA = {
  ENV,
  BASE_URL: stripTrailingSlash(BASE_URL),

  CONSUMER_KEY,
  CONSUMER_SECRET,
  PASSKEY,

  PAYBILL_SHORTCODE,
  TILL_NUMBER,

  // Back-compat: SHORTCODE = paybill business shortcode
  SHORTCODE: PAYBILL_SHORTCODE,

  CALLBACK_URL,

  MODE,
} as const;

export function logMpesaBootOnce() {
  if (!safeLogEnabled()) return;

  const FLAG = "__MPESA_BOOT_LOGGED__";
  const g = globalThis as unknown as Record<string, any>;
  if (g[FLAG]) return;
  g[FLAG] = true;

  // Avoid leaking credentials; shortcodes + callback are fine.
  // eslint-disable-next-line no-console
  console.info(
    `[mpesa] boot → env=${MPESA.ENV} base=${MPESA.BASE_URL} mode=${MPESA.MODE} paybill=${MPESA.PAYBILL_SHORTCODE} till=${MPESA.TILL_NUMBER || "(none)"} callback=${MPESA.CALLBACK_URL}`,
  );
}

/* ------------------------------------------------------------------ */
/* ------------------------------ HTTP utils ------------------------- */
/* ------------------------------------------------------------------ */

const DEFAULT_TIMEOUT_MS = 12_000;
const BACKOFF_CAP_MS = 8_000;

// Token fetch can retry.
// STK push should NOT retry by default (not idempotent).
const DEFAULT_TOKEN_RETRIES = 2;
const DEFAULT_STK_RETRIES = 0;

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
    return raw ? ({ raw } as any) : null;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isNetworkishError(e: unknown): boolean {
  const msg = String((e as any)?.message ?? "");
  const name = String((e as any)?.name ?? "");
  if (name === "AbortError") return true;
  if (e instanceof TypeError) return true;
  return /network|fetch|timed out|ECONN|ENOTFOUND/i.test(msg);
}

function looksLikeInvalidToken(err: unknown): boolean {
  const e = err as any;
  const status = Number(e?.status);
  const code = String(e?.code ?? "");
  const msg = String(e?.message ?? "");
  // Common signals:
  // - HTTP 401/403 from Daraja
  // - Daraja errorCode "404.001.03" ("Invalid Access Token")
  if (status === 401 || status === 403) return true;
  if (code === "404.001.03") return true;
  if (/invalid access token/i.test(msg)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* ------------------------------ Errors ----------------------------- */
/* ------------------------------------------------------------------ */

export class MpesaError extends Error {
  code?: string | number;
  status?: number;
  data?: any;

  constructor(message: string, opts: { code?: string | number; status?: number; data?: any } = {}) {
    super(message);
    this.name = "MpesaError";
    if (opts.code !== undefined) this.code = opts.code;
    if (opts.status !== undefined) this.status = opts.status;
    if (opts.data !== undefined) this.data = opts.data;
  }
}

/* ------------------------------------------------------------------ */
/* --------------------------- Token (OAuth) ------------------------- */
/* ------------------------------------------------------------------ */

type TokenResponse = { access_token?: string; expires_in?: string | number };

type TokenCacheEntry = {
  token?: string;
  expiresAt?: number; // epoch ms
  inflight?: Promise<string>;
};

type TokenCache = Record<string, TokenCacheEntry>;

function tokenCacheKey() {
  // Prevent “sandbox token used on prod base” or vice versa.
  // Also isolates between different credentials.
  const k = MPESA.CONSUMER_KEY ? MPESA.CONSUMER_KEY.slice(0, 8) : "nokey";
  return `${MPESA.ENV}|${MPESA.BASE_URL}|${k}`;
}

function getTokenCache(): TokenCache {
  const g = globalThis as unknown as { __QS_MPESA_TOKEN_MAP__?: TokenCache };
  if (!g.__QS_MPESA_TOKEN_MAP__) g.__QS_MPESA_TOKEN_MAP__ = {};
  return g.__QS_MPESA_TOKEN_MAP__;
}

function isTokenValid(entry?: TokenCacheEntry) {
  if (!entry?.token || !entry?.expiresAt) return false;
  return Date.now() + TOKEN_SKEW_MS < entry.expiresAt;
}

async function fetchAccessToken(opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<{
  token: string;
  expiresAt: number;
}> {
  const key = MPESA.CONSUMER_KEY;
  const secret = MPESA.CONSUMER_SECRET;
  if (!key || !secret) throw new MpesaError("Missing MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET");

  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const url = `${stripTrailingSlash(MPESA.BASE_URL)}/oauth/v1/generate?grant_type=client_credentials`;

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
      throw new MpesaError(`M-Pesa token error ${r.status}`, { status: r.status, data: body });
    }

    const token = (body as any)?.access_token;
    if (!token) throw new MpesaError("No access_token in Daraja response", { data: body });

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
  const key = tokenCacheKey();
  const entry: TokenCacheEntry = (cache[key] ??= {});

  if (!opts?.forceRefresh && isTokenValid(entry)) {
    return entry.token as string;
  }

  if (entry.inflight) return await entry.inflight;

  const retries = Math.max(0, opts?.retries ?? DEFAULT_TOKEN_RETRIES);
  let attempt = 0;

  entry.inflight = (async () => {
    while (true) {
      try {
        // ✅ exactOptionalPropertyTypes-safe: do not pass `timeoutMs: undefined`
        const tokOpts: { timeoutMs?: number; signal?: AbortSignal } = {};
        if (opts?.timeoutMs !== undefined) tokOpts.timeoutMs = opts.timeoutMs;
        if (opts?.signal !== undefined) tokOpts.signal = opts.signal;

        const tok = await fetchAccessToken(tokOpts);

        entry.token = tok.token;
        entry.expiresAt = tok.expiresAt;

        if (safeLogEnabled()) {
          // eslint-disable-next-line no-console
          console.info(`[mpesa] token ok → expiresInMs=${Math.max(0, tok.expiresAt - Date.now())}`);
        }

        return tok.token;
      } catch (e) {
        attempt += 1;
        if (attempt > retries) throw e;

        const delay = Math.min(1000 * Math.pow(2, attempt - 1), BACKOFF_CAP_MS);
        if (safeLogEnabled()) {
          // eslint-disable-next-line no-console
          console.warn(`[mpesa] token retry in ${delay}ms (${attempt}/${retries})`);
        }
        await sleep(delay);
      }
    }
  })();

  try {
    return await entry.inflight;
  } finally {
    delete entry.inflight;
  }
}

/* ------------------------------------------------------------------ */
/* ----------------------------- STK Push ---------------------------- */
/* ------------------------------------------------------------------ */

export type StkPushResponse = {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string | "0";
  ResponseDescription: string;
  CustomerMessage: string;
};

type StkPushInput = {
  amount: number; // KES
  phone: string; // raw accepted; will be normalized
  accountReference?: string;
  description?: string;
  mode?: "till" | "paybill";
  signal?: AbortSignal;
  timeoutMs?: number;
  tokenRetries?: number;
  requestRetries?: number;
  requestId?: string;
};

function mkReqId() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = globalThis.crypto as any;
    return c?.randomUUID?.() ?? `qs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  } catch {
    return `qs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

/**
 * Option B target selection:
 * - BusinessShortCode always = PAYBILL
 * - PartyB = PAYBILL for paybill mode
 * - PartyB = TILL for till mode
 */
function pickTarget(mode: "till" | "paybill") {
  const paybill = MPESA.PAYBILL_SHORTCODE;
  const till = MPESA.TILL_NUMBER;

  if (!paybill) throw new MpesaError("Missing MPESA_PAYBILL_SHORTCODE (or MPESA_SHORT_CODE/MPESA_SHORTCODE)");

  if (mode === "till") {
    if (!till) throw new MpesaError("Missing MPESA_TILL_NUMBER (required for mode=till)");
    return {
      businessShortCode: paybill,
      partyB: till,
      transactionType: "CustomerBuyGoodsOnline",
    } as const;
  }

  return {
    businessShortCode: paybill,
    partyB: paybill,
    transactionType: "CustomerPayBillOnline",
  } as const;
}

function buildMpesaErrorFromResponse(res: Response, data: any, fallbackMsg: string) {
  const maybeCode = data?.errorCode ?? data?.ResponseCode ?? res.status;
  const msg = data?.errorMessage ?? data?.ResponseDescription ?? data?.CustomerMessage ?? data?.raw ?? fallbackMsg;

  const errOpts: { code?: string | number; status?: number; data?: any } = {
    status: res.status,
    data,
  };
  if (typeof maybeCode === "string" || typeof maybeCode === "number") errOpts.code = maybeCode;

  return new MpesaError(`STK push failed: ${String(msg)}`, errOpts);
}

/** Canonical STK Push helper (production-ready) */
export async function stkPush(input: StkPushInput): Promise<StkPushResponse> {
  const {
    amount,
    phone,
    accountReference = "QWIKSALE",
    description = "Qwiksale payment",
    mode,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    tokenRetries = DEFAULT_TOKEN_RETRIES,
    requestRetries = DEFAULT_STK_RETRIES,
    requestId = mkReqId(),
  } = input;

  if (!Number.isFinite(amount) || amount < 1) throw new MpesaError("Invalid amount (min 1 KES)");

  const msisdn = normalizeMsisdn(phone);
  if (!/^254(7|1)\d{8}$/.test(msisdn)) throw new MpesaError("Invalid msisdn (use 2547XXXXXXXX or 2541XXXXXXXX)");

  const useMode = mode || MPESA.MODE || "paybill";
  const tgt = pickTarget(useMode);

  const timestamp = yyyymmddhhmmss();
  const password = stkPassword(tgt.businessShortCode, MPESA.PASSKEY, timestamp);

  const amt = Math.round(amount);

  const body = {
    BusinessShortCode: Number(tgt.businessShortCode),
    Password: String(password),
    Timestamp: String(timestamp),
    TransactionType: String(tgt.transactionType),
    Amount: amt,
    PartyA: Number(msisdn),
    PartyB: Number(tgt.partyB),
    PhoneNumber: Number(msisdn),
    CallBackURL: String(MPESA.CALLBACK_URL),
    AccountReference: String(accountReference).trim().slice(0, 12) || "QWIKSALE",
    TransactionDesc: String(description).trim().slice(0, 32) || "Qwiksale payment",
  };

  const url = `${stripTrailingSlash(MPESA.BASE_URL)}/mpesa/stkpush/v1/processrequest`;

  if (safeLogEnabled()) {
    // eslint-disable-next-line no-console
    console.info(
      `[mpesa] STK(${requestId}) → env=${MPESA.ENV} base=${MPESA.BASE_URL} mode=${useMode} type=${tgt.transactionType} biz=${tgt.businessShortCode} partyB=${tgt.partyB} amount=${amt} msisdn=${maskMsisdn(msisdn)}`,
    );
  }

  // 1) Get token
  let token = await getAccessToken({
    retries: tokenRetries,
    timeoutMs,
    ...(signal ? { signal } : {}),
  });

  // 2) Request loop (network retries only) + special “invalid token” one-shot refresh
  let attempt = 0;
  const maxAttempts = Math.max(0, requestRetries) + 1;

  while (attempt < maxAttempts) {
    attempt += 1;

    const t = withTimeout(signal, timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: t.signal,
      });

      const data = (await parseJsonSafe<any>(res)) ?? {};
      const ok = data?.ResponseCode === "0" || data?.ResponseCode === 0;

      if (!res.ok || !ok) {
        const err = buildMpesaErrorFromResponse(res, data, "Unknown error");

        // If token is invalid, refresh once and retry immediately
        if (looksLikeInvalidToken(err)) {
          if (safeLogEnabled()) {
            // eslint-disable-next-line no-console
            console.warn(`[mpesa] STK(${requestId}) invalid token → forcing refresh and retrying once`);
          }
          token = await getAccessToken({
            retries: tokenRetries,
            timeoutMs,
            forceRefresh: true,
            ...(signal ? { signal } : {}),
          });

          const t2 = withTimeout(signal, timeoutMs);
          try {
            const res2 = await fetch(url, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify(body),
              cache: "no-store",
              signal: t2.signal,
            });

            const data2 = (await parseJsonSafe<any>(res2)) ?? {};
            const ok2 = data2?.ResponseCode === "0" || data2?.ResponseCode === 0;

            if (!res2.ok || !ok2) {
              const err2 = buildMpesaErrorFromResponse(res2, data2, "Unknown error");
              if (safeLogEnabled()) {
                // eslint-disable-next-line no-console
                console.warn(
                  `[mpesa] STK(${requestId}) failed after token refresh → status=${err2.status} code=${String(err2.code ?? "")} msg=${err2.message}`,
                );
              }
              throw err2;
            }

            if (safeLogEnabled()) {
              // eslint-disable-next-line no-console
              console.info(`[mpesa] STK(${requestId}) ok → CheckoutRequestID=${String(data2?.CheckoutRequestID)}`);
            }

            return {
              MerchantRequestID: String(data2.MerchantRequestID),
              CheckoutRequestID: String(data2.CheckoutRequestID),
              ResponseCode: String(data2.ResponseCode),
              ResponseDescription: String(data2.ResponseDescription),
              CustomerMessage: String(data2.CustomerMessage),
            };
          } finally {
            t2.done();
          }
        }

        if (safeLogEnabled()) {
          // eslint-disable-next-line no-console
          console.warn(
            `[mpesa] STK(${requestId}) failed → status=${err.status} code=${String(err.code ?? "")} msg=${err.message}`,
          );
        }

        throw err;
      }

      if (safeLogEnabled()) {
        // eslint-disable-next-line no-console
        console.info(`[mpesa] STK(${requestId}) ok → CheckoutRequestID=${String(data?.CheckoutRequestID)}`);
      }

      return {
        MerchantRequestID: String(data.MerchantRequestID),
        CheckoutRequestID: String(data.CheckoutRequestID),
        ResponseCode: String(data.ResponseCode),
        ResponseDescription: String(data.ResponseDescription),
        CustomerMessage: String(data.CustomerMessage),
      };
    } catch (e) {
      const canRetry = attempt < maxAttempts && isNetworkishError(e);
      if (!canRetry) throw e;

      const delay = Math.min(1000 * Math.pow(2, attempt - 1), BACKOFF_CAP_MS);
      if (safeLogEnabled()) {
        // eslint-disable-next-line no-console
        console.warn(`[mpesa] STK(${requestId}) retry in ${delay}ms (attempt ${attempt}/${maxAttempts})`);
      }
      await sleep(delay);
    } finally {
      t.done();
    }
  }

  throw new MpesaError("STK push failed after retries");
}

/* ------------------------------------------------------------------ */
/* ------------------------------ STK Query -------------------------- */
/* ------------------------------------------------------------------ */

export type StkQueryResponse = {
  ResponseCode?: string;
  ResponseDescription?: string;
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResultCode?: string | number;
  ResultDesc?: string;
};

export async function stkQuery(opts: {
  checkoutRequestId: string;
  mode?: "till" | "paybill";
  signal?: AbortSignal;
  timeoutMs?: number;
  tokenRetries?: number;
}) {
  const checkoutRequestId = String(opts.checkoutRequestId || "").trim();
  if (!checkoutRequestId) throw new MpesaError("checkoutRequestId required");

  const useMode = opts.mode || MPESA.MODE || "paybill";
  const tgt = pickTarget(useMode);

  const timestamp = yyyymmddhhmmss();
  const password = stkPassword(tgt.businessShortCode, MPESA.PASSKEY, timestamp);

  const token = await getAccessToken({
    retries: Math.max(0, opts.tokenRetries ?? DEFAULT_TOKEN_RETRIES),
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });

  const url = `${stripTrailingSlash(MPESA.BASE_URL)}/mpesa/stkpushquery/v1/query`;
  const body = {
    BusinessShortCode: Number(tgt.businessShortCode),
    Password: String(password),
    Timestamp: String(timestamp),
    CheckoutRequestID: checkoutRequestId,
  };

  if (safeLogEnabled()) {
    // eslint-disable-next-line no-console
    console.info(
      `[mpesa] STK-QUERY → env=${MPESA.ENV} base=${MPESA.BASE_URL} mode=${useMode} biz=${tgt.businessShortCode} checkout=${checkoutRequestId}`,
    );
  }

  const t = withTimeout(opts.signal, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: t.signal,
    });

    const data = (await parseJsonSafe<any>(res)) ?? {};
    if (!res.ok) throw new MpesaError(`STK query failed ${res.status}`, { status: res.status, data });

    return data as StkQueryResponse;
  } finally {
    t.done();
  }
}