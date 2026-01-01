// src/app/lib/env.ts

/**
 * Centralized environment resolution.
 * - Safe to import from both server and client.
 * - Provides DB URL, app URL, cookie domain, Cloudinary, M-Pesa, and admin allowlists.
 */

const isServer = typeof window === "undefined";
const NODE_ENV = process.env["NODE_ENV"] ?? "development";
export const isDev = NODE_ENV !== "production";

/* ------------------------------------------------------------------ */
/* --------------------------- Small helpers ------------------------- */
/* ------------------------------------------------------------------ */

function trimTrailingSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

function toBool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(s)) return true;
    if (["0", "false", "no", "off"].includes(s)) return false;
  }
  return fallback;
}

function parseList(v?: string | null): string[] {
  return (v ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function safeUrl(input?: string | null): URL | null {
  if (!input) return null;
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

/** Derive a cookie domain from a public URL (e.g. https://app.example.com → .example.com) */
function cookieDomainFrom(urlStr?: string | null): string | undefined {
  const u = safeUrl(urlStr);
  if (!u) return undefined;
  const h = u.hostname;
  const parts = h.split(".");
  if (parts.length < 2) return undefined; // localhost or similar
  const apex = parts.slice(-2).join(".");
  return `.${apex}`;
}

function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h.endsWith(".localhost");
}

/**
 * Real prod deployment detector (not just NODE_ENV=production).
 * This mirrors the intent of middleware.ts (avoid treating localhost as real prod).
 */
function isRealProdSite(appUrl: string): boolean {
  if (!isServer) return false;

  const vercelEnv = process.env["VERCEL_ENV"];
  if (vercelEnv) return vercelEnv === "production";

  if (NODE_ENV !== "production") return false;

  const u = safeUrl(appUrl);
  if (!u) return true;

  return !isLocalHostname(u.hostname);
}

function envRaw(name: string): string | undefined {
  const v = process.env[name];
  return typeof v === "string" ? v : undefined;
}

type TrimResult = { value: string | undefined; hadWhitespace: boolean };

function envTrim(name: string): TrimResult {
  const raw = envRaw(name);
  if (raw == null) return { value: undefined, hadWhitespace: false };
  const trimmed = raw.trim();
  const hadWhitespace = raw !== trimmed;
  return { value: trimmed || undefined, hadWhitespace };
}

function must(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function warnOnce(key: string, msg: string): void {
  if (!isServer) return;
  const g = globalThis as unknown as Record<string, any>;
  const k = `__ENV_WARNED__${key}__`;
  if (g[k]) return;
  g[k] = true;
  // eslint-disable-next-line no-console
  console.warn(msg);
}

/* ------------------------------------------------------------------ */
/* --------------------------- Database URL -------------------------- */
/* ------------------------------------------------------------------ */

/**
 * Prefer explicit hosted URLs.
 * On the client, this returns an empty string so imports are safe.
 */
function resolveDatabaseUrl(): string {
  if (!isServer) return "";

  const candidates = [
    process.env["NEON_DATABASE_URL"],
    process.env["POSTGRES_PRISMA_URL"],
    process.env["POSTGRES_URL_NON_POOLING"],
    process.env["POSTGRES_URL"],
    process.env["DATABASE_URL"],
  ].filter(Boolean) as string[];

  if (candidates.length === 0) {
    throw new Error(
      "Missing database URL. Set DATABASE_URL (or NEON_DATABASE_URL / POSTGRES_URL*).",
    );
  }

  const nonLocal = candidates.find((u) => {
    try {
      const host = new URL(u).hostname;
      return !/^localhost$|^127\.0\.0\.1$/.test(host);
    } catch {
      return false;
    }
  });

  return nonLocal || candidates[0]!;
}

const DB_URL = resolveDatabaseUrl();

/** Optional: log DB target once in dev (server only). */
export function logDbTargetOnce(): void {
  if (!isDev || !isServer) return;
  // @ts-ignore
  if (globalThis.__DB_LOGGED__) return;
  // @ts-ignore
  globalThis.__DB_LOGGED__ = true;

  try {
    const u = new URL(DB_URL);
    const dbName = u.pathname?.slice(1) || "";
    // eslint-disable-next-line no-console
    console.info(
      `[db] Using ${u.protocol}//${u.hostname}${u.port ? ":" + u.port : ""}/${dbName}`,
    );
  } catch {
    // eslint-disable-next-line no-console
    console.info("[db] Using configured DATABASE_URL");
  }
}

/* ------------------------------------------------------------------ */
/* --------------------------- Public App URL ------------------------ */
/* ------------------------------------------------------------------ */

const rawAppUrl =
  process.env["NEXT_PUBLIC_APP_URL"] ||
  process.env["APP_URL"] ||
  (process.env["VERCEL_URL"] ? `https://${process.env["VERCEL_URL"]}` : "") ||
  "http://localhost:3000";

const APP_URL = trimTrailingSlash(rawAppUrl);
const APP_COOKIE_DOMAIN: string = cookieDomainFrom(APP_URL) ?? "";

const IS_REAL_PROD_SITE = isRealProdSite(APP_URL);

/* ------------------------------------------------------------------ */
/* ---------------------------- Cloudinary --------------------------- */
/* ------------------------------------------------------------------ */

const CLOUDINARY_CLOUD_NAME =
  process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] ||
  process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD"] ||
  "";

const CLOUDINARY_PRESET_AVATARS =
  process.env["NEXT_PUBLIC_CLOUDINARY_PRESET_AVATARS"] || "";

const CLOUDINARY_PRESET_PRODUCTS =
  process.env["NEXT_PUBLIC_CLOUDINARY_PRESET_PRODUCTS"] || "";

const CLOUDINARY_UPLOAD_FOLDER_AVATARS =
  process.env["CLOUDINARY_UPLOAD_FOLDER_AVATARS"] || "";

if (isDev && isServer && !CLOUDINARY_CLOUD_NAME) {
  // eslint-disable-next-line no-console
  console.warn("[env] Missing NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME");
}

/* ------------------------------------------------------------------ */
/* ------------------------------ M-Pesa ----------------------------- */
/* ------------------------------------------------------------------ */

type MpesaMode = "till" | "paybill";
type MpesaEnv = "sandbox" | "production";

const mpesaEnvRaw = envTrim("MPESA_ENV");
const MPESA_ENV = (mpesaEnvRaw.value || "sandbox") as MpesaEnv;

if (mpesaEnvRaw.hadWhitespace) {
  warnOnce(
    "MPESA_ENV_WS",
    `[env] MPESA_ENV has leading/trailing whitespace. Fix your .env value.`,
  );
}

const derivedMpesaBase =
  MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

const baseUrlRaw = envTrim("MPESA_BASE_URL");
const callbackUrlRaw = envTrim("MPESA_CALLBACK_URL");

// Support your actual env name MPESA_SHORT_CODE, plus legacy MPESA_SHORTCODE
const shortCodeA = envTrim("MPESA_SHORT_CODE");
const shortCodeB = envTrim("MPESA_SHORTCODE");

const modeRaw = envTrim("MPESA_MODE");
const modeClean = (modeRaw.value || "paybill").toLowerCase();

const MPESA = {
  environment: MPESA_ENV,
  baseUrl: trimTrailingSlash(baseUrlRaw.value || derivedMpesaBase),

  // NOTE: your env uses MPESA_SHORT_CODE, keep that as primary.
  shortCode:
    shortCodeA.value ||
    shortCodeB.value ||
    (MPESA_ENV === "sandbox" ? "174379" : ""),

  passkey: envTrim("MPESA_PASSKEY").value || "",
  consumerKey: envTrim("MPESA_CONSUMER_KEY").value || "",
  consumerSecret: envTrim("MPESA_CONSUMER_SECRET").value || "",

  // Default callback should match the production env target you set:
  //   MPESA_CALLBACK_URL=https://qwiksale.sale/api/pay/mpesa/callback
  callbackUrl: callbackUrlRaw.value || `${APP_URL}/api/pay/mpesa/callback`,

  mode: ((modeClean as MpesaMode) || "paybill") as MpesaMode,
} as const;

// Whitespace warnings (catches `MPESA_CALLBACK_URL= https://...`)
if (baseUrlRaw.hadWhitespace) {
  warnOnce(
    "MPESA_BASE_URL_WS",
    `[env] MPESA_BASE_URL has leading/trailing whitespace. Fix your .env value.`,
  );
}
if (callbackUrlRaw.hadWhitespace) {
  warnOnce(
    "MPESA_CALLBACK_URL_WS",
    `[env] MPESA_CALLBACK_URL has leading/trailing whitespace (common: space after '=') — fix to MPESA_CALLBACK_URL=https://...`,
  );
}
if (shortCodeA.hadWhitespace || shortCodeB.hadWhitespace) {
  warnOnce(
    "MPESA_SHORT_CODE_WS",
    `[env] MPESA_SHORT_CODE has leading/trailing whitespace. Fix your .env value.`,
  );
}
if (modeRaw.hadWhitespace) {
  warnOnce(
    "MPESA_MODE_WS",
    `[env] MPESA_MODE has leading/trailing whitespace. Fix your .env value.`,
  );
}

/* ------------------- Validation (tight) ------------------- */

function validateMpesaConfig(): void {
  if (!isServer) return;

  // Validate MPESA_ENV
  const envOk = MPESA.environment === "sandbox" || MPESA.environment === "production";
  if (!envOk) {
    const msg = `[env] MPESA_ENV must be 'sandbox' or 'production' (found '${String(
      MPESA.environment,
    )}')`;
    if (IS_REAL_PROD_SITE) must(false, msg);
    else warnOnce("MPESA_ENV_BAD", msg);
  }

  // Validate MODE
  const modeOk = MPESA.mode === "till" || MPESA.mode === "paybill";
  if (!modeOk) {
    const msg = `[env] MPESA_MODE must be 'till' or 'paybill' (found '${String(MPESA.mode)}')`;
    if (IS_REAL_PROD_SITE) must(false, msg);
    else warnOnce("MPESA_MODE_BAD", msg);
  }

  // Validate BASE_URL matches MPESA_ENV
  const base = MPESA.baseUrl;
  if (MPESA.environment === "sandbox" && !/sandbox\.safaricom\.co\.ke/i.test(base)) {
    const msg = `[env] MPESA_ENV=sandbox but MPESA_BASE_URL does not look like sandbox.safaricom.co.ke (found '${base}')`;
    if (IS_REAL_PROD_SITE) must(false, msg);
    else warnOnce("MPESA_BASE_MISMATCH", msg);
  }
  if (MPESA.environment === "production" && !/api\.safaricom\.co\.ke/i.test(base)) {
    const msg = `[env] MPESA_ENV=production but MPESA_BASE_URL does not look like api.safaricom.co.ke (found '${base}')`;
    if (IS_REAL_PROD_SITE) must(false, msg);
    else warnOnce("MPESA_BASE_MISMATCH", msg);
  }

  // Validate callback URL path matches routes
  const cb = MPESA.callbackUrl;
  const cbUrl = safeUrl(cb);
  if (!cbUrl) {
    const msg = `[env] MPESA_CALLBACK_URL is not a valid URL (found '${cb}')`;
    if (IS_REAL_PROD_SITE) must(false, msg);
    else warnOnce("MPESA_CB_BADURL", msg);
  } else {
    const p = cbUrl.pathname.replace(/\/+$/, "");
    const okNew = p === "/api/pay/mpesa/callback";
    const okLegacy = p === "/api/mpesa/callback";

    if (!okNew && !okLegacy) {
      const msg =
        `[env] MPESA_CALLBACK_URL path must end with /api/pay/mpesa/callback ` +
        `(legacy also supported: /api/mpesa/callback) — found '${cbUrl.pathname}'`;
      if (IS_REAL_PROD_SITE) must(false, msg);
      else warnOnce("MPESA_CB_BADPATH", msg);
    } else if (okLegacy) {
      warnOnce(
        "MPESA_CB_LEGACY",
        `[env] MPESA_CALLBACK_URL is using legacy path /api/mpesa/callback. Prefer /api/pay/mpesa/callback.`,
      );
    }
  }

  // Validate short code shape
  if (MPESA.shortCode) {
    const sc = String(MPESA.shortCode).trim();
    if (!/^\d{5,10}$/.test(sc)) {
      const msg = `[env] MPESA_SHORT_CODE should be digits (found '${sc}')`;
      if (IS_REAL_PROD_SITE) must(false, msg);
      else warnOnce("MPESA_SC_BAD", msg);
    }
  }

  // Required in REAL production (fail fast)
  if (IS_REAL_PROD_SITE && MPESA.environment === "production") {
    const missing = [
      ["MPESA_SHORT_CODE", MPESA.shortCode],
      ["MPESA_PASSKEY", MPESA.passkey],
      ["MPESA_CONSUMER_KEY", MPESA.consumerKey],
      ["MPESA_CONSUMER_SECRET", MPESA.consumerSecret],
      ["MPESA_CALLBACK_URL", MPESA.callbackUrl],
      ["MPESA_BASE_URL", MPESA.baseUrl],
    ]
      .filter(([, v]) => !v)
      .map(([k]) => k);

    must(
      missing.length === 0,
      `[env] Missing required M-Pesa env in production: ${missing.join(", ")}`,
    );
  }
}

validateMpesaConfig();

/* ------------------------------------------------------------------ */
/* ------------------------- Admin allowlists ------------------------ */
/* ------------------------------------------------------------------ */

const ADMIN_EMAILS_RAW = process.env["ADMIN_EMAILS"] || "";
const SUPERADMIN_EMAILS_RAW = process.env["SUPERADMIN_EMAILS"] || "";

const adminEmailsList = parseList(ADMIN_EMAILS_RAW);
const superAdminEmailsList = parseList(SUPERADMIN_EMAILS_RAW);

/* ------------------------------------------------------------------ */
/* ------------------------------ Export ----------------------------- */
/* ------------------------------------------------------------------ */

export const env = {
  NODE_ENV,
  isServer,
  isDev,

  // Database
  DATABASE_URL: DB_URL,

  // App URL / cookies
  APP_URL,
  APP_COOKIE_DOMAIN, // e.g. ".qwiksale.sale" or "" on localhost

  // Admin allowlists
  ADMIN_EMAILS: ADMIN_EMAILS_RAW,
  SUPERADMIN_EMAILS: SUPERADMIN_EMAILS_RAW,
  adminEmailsList,
  superAdminEmailsList,

  // Prisma / logging toggles
  PRISMA_LOG_QUERIES: process.env["PRISMA_LOG_QUERIES"],
  PRISMA_SLOW_QUERY_MS: process.env["PRISMA_SLOW_QUERY_MS"],

  // Cloudinary (client-safe)
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: CLOUDINARY_CLOUD_NAME,
  NEXT_PUBLIC_CLOUDINARY_PRESET_AVATARS: CLOUDINARY_PRESET_AVATARS,
  NEXT_PUBLIC_CLOUDINARY_PRESET_PRODUCTS: CLOUDINARY_PRESET_PRODUCTS,
  CLOUDINARY_UPLOAD_FOLDER_AVATARS,

  // Example feature flag
  FEATURE_SIGNUP_OPEN: toBool(process.env["FEATURE_SIGNUP_OPEN"], true),

  // Raw passthroughs
  RAW: {
    VERCEL_URL: process.env["VERCEL_URL"],
    GOOGLE_SITE_VERIFICATION: process.env["GOOGLE_SITE_VERIFICATION"],
    BING_SITE_VERIFICATION: process.env["BING_SITE_VERIFICATION"],
  },
} as const;

export const mpesa = MPESA;

/* ------------------------------------------------------------------ */
/* ----------------------------- Utilities --------------------------- */
/* ------------------------------------------------------------------ */

/** Public site URL (no trailing slash). */
export function getAppUrl(): string {
  return APP_URL;
}

/**
 * Cookie domain like ".qwiksale.sale".
 * Returns undefined for localhost / non-apex.
 */
export function getCookieDomain(): string | undefined {
  return APP_COOKIE_DOMAIN || undefined;
}
