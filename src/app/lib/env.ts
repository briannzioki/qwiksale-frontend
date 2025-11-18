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
    if (["1", "true", "yes", "on"].includes(s))
      return true;
    if (["0", "false", "no", "off"].includes(s))
      return false;
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
function cookieDomainFrom(
  urlStr?: string | null
): string | undefined {
  const u = safeUrl(urlStr);
  if (!u) return undefined;
  const h = u.hostname;
  const parts = h.split(".");
  if (parts.length < 2) return undefined; // localhost or similar
  const apex = parts.slice(-2).join(".");
  return `.${apex}`;
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
      "Missing database URL. Set DATABASE_URL (or NEON_DATABASE_URL / POSTGRES_URL*)."
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
      `[db] Using ${u.protocol}//${u.hostname}${
        u.port ? ":" + u.port : ""
      }/${dbName}`
    );
  } catch {
    // eslint-disable-next-line no-console
    console.info(
      "[db] Using configured DATABASE_URL"
    );
  }
}

/* ------------------------------------------------------------------ */
/* --------------------------- Public App URL ------------------------ */
/* ------------------------------------------------------------------ */

const rawAppUrl =
  process.env["NEXT_PUBLIC_APP_URL"] ||
  process.env["APP_URL"] ||
  (process.env["VERCEL_URL"]
    ? `https://${process.env["VERCEL_URL"]}`
    : "") ||
  "http://localhost:3000";

const APP_URL = trimTrailingSlash(rawAppUrl);
const APP_COOKIE_DOMAIN: string =
  cookieDomainFrom(APP_URL) ?? "";

/* ------------------------------------------------------------------ */
/* ---------------------------- Cloudinary --------------------------- */
/* ------------------------------------------------------------------ */

const CLOUDINARY_CLOUD_NAME =
  process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] ||
  process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD"] ||
  "";

const CLOUDINARY_PRESET_AVATARS =
  process.env["NEXT_PUBLIC_CLOUDINARY_PRESET_AVATARS"] ||
  "";

const CLOUDINARY_PRESET_PRODUCTS =
  process.env["NEXT_PUBLIC_CLOUDINARY_PRESET_PRODUCTS"] ||
  "";

const CLOUDINARY_UPLOAD_FOLDER_AVATARS =
  process.env["CLOUDINARY_UPLOAD_FOLDER_AVATARS"] ||
  "";

if (isDev && isServer && !CLOUDINARY_CLOUD_NAME) {
  // eslint-disable-next-line no-console
  console.warn(
    "[env] Missing NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"
  );
}

/* ------------------------------------------------------------------ */
/* ------------------------------ M-Pesa ----------------------------- */
/* ------------------------------------------------------------------ */

type MpesaMode = "till" | "paybill";
type MpesaEnv = "sandbox" | "production";

const MPESA_ENV = (process.env["MPESA_ENV"] ||
  "sandbox") as MpesaEnv;

const derivedMpesaBase =
  MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

const MPESA = {
  environment: MPESA_ENV,
  baseUrl:
    process.env["MPESA_BASE_URL"] ||
    derivedMpesaBase,
  shortCode:
    process.env["MPESA_SHORTCODE"] ||
    (MPESA_ENV === "sandbox"
      ? "174379"
      : ""),
  passkey: process.env["MPESA_PASSKEY"] || "",
  consumerKey:
    process.env["MPESA_CONSUMER_KEY"] || "",
  consumerSecret:
    process.env["MPESA_CONSUMER_SECRET"] || "",
  callbackUrl:
    process.env["MPESA_CALLBACK_URL"] ||
    `${APP_URL}/api/mpesa/callback`,
  mode:
    ((process.env["MPESA_MODE"] ||
      "paybill") as MpesaMode) || "paybill",
} as const;

if (
  isServer &&
  !isDev &&
  MPESA.environment === "production"
) {
  const missing = [
    ["MPESA_SHORTCODE", MPESA.shortCode],
    ["MPESA_PASSKEY", MPESA.passkey],
    ["MPESA_CONSUMER_KEY", MPESA.consumerKey],
    ["MPESA_CONSUMER_SECRET", MPESA.consumerSecret],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `[env] Missing required M-Pesa env in production: ${missing.join(
        ", "
      )}`
    );
  }
}

/* ------------------------------------------------------------------ */
/* ------------------------- Admin allowlists ------------------------ */
/* ------------------------------------------------------------------ */

const ADMIN_EMAILS_RAW =
  process.env["ADMIN_EMAILS"] || "";
const SUPERADMIN_EMAILS_RAW =
  process.env["SUPERADMIN_EMAILS"] || "";

const adminEmailsList =
  parseList(ADMIN_EMAILS_RAW);
const superAdminEmailsList =
  parseList(SUPERADMIN_EMAILS_RAW);

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
  PRISMA_LOG_QUERIES:
    process.env["PRISMA_LOG_QUERIES"],
  PRISMA_SLOW_QUERY_MS:
    process.env["PRISMA_SLOW_QUERY_MS"],

  // Cloudinary (client-safe)
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
    CLOUDINARY_CLOUD_NAME,
  NEXT_PUBLIC_CLOUDINARY_PRESET_AVATARS:
    CLOUDINARY_PRESET_AVATARS,
  NEXT_PUBLIC_CLOUDINARY_PRESET_PRODUCTS:
    CLOUDINARY_PRESET_PRODUCTS,
  CLOUDINARY_UPLOAD_FOLDER_AVATARS,

  // Example feature flag
  FEATURE_SIGNUP_OPEN: toBool(
    process.env["FEATURE_SIGNUP_OPEN"],
    true
  ),

  // Raw passthroughs
  RAW: {
    VERCEL_URL: process.env["VERCEL_URL"],
    GOOGLE_SITE_VERIFICATION:
      process.env["GOOGLE_SITE_VERIFICATION"],
    BING_SITE_VERIFICATION:
      process.env["BING_SITE_VERIFICATION"],
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
export function getCookieDomain():
  | string
  | undefined {
  return APP_COOKIE_DOMAIN || undefined;
}
