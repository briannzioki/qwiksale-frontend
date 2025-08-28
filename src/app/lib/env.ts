// src/app/lib/env.ts
import "server-only";

/**
 * Prefer explicit hosted URLs (Neon/Vercel) over any accidental local/OS env.
 * Falls back to DATABASE_URL if it is not a localhost address.
 */
function resolveDatabaseUrl(): string {
  const candidates = [
    process.env.NEON_DATABASE_URL,        // Neon (optional)
    process.env.POSTGRES_PRISMA_URL,      // Vercel Postgres (non-pooled)
    process.env.POSTGRES_URL_NON_POOLING, // Vercel Postgres (non-pooled)
    process.env.POSTGRES_URL,             // Generic POSTGRES_URL
    process.env.DATABASE_URL,             // Default Prisma var
  ].filter(Boolean) as string[];

  if (candidates.length === 0) {
    throw new Error(
      "Missing database URL. Set DATABASE_URL (or NEON_DATABASE_URL / POSTGRES_URL*)."
    );
  }

  // Choose the first non-localhost candidate if possible
  const nonLocal = candidates.find((u) => {
    try {
      const host = new URL(u).hostname;
      return !/^localhost$|^127\.0\.0\.1$/.test(host);
    } catch {
      return false;
    }
  });

  return nonLocal ?? candidates[0];
}

const DB_URL = resolveDatabaseUrl();
const NODE_ENV = process.env.NODE_ENV ?? "development";
export const isDev = NODE_ENV !== "production";

/**
 * App-wide env bag (add keys here if you read them in TS code).
 * - APP_URL: public URL of the app (Vercel/custom domain). Used as a fallback for callbacks.
 * - ADMIN_EMAILS: comma-separated list of admin emails (optional).
 */
export const env = {
  NODE_ENV,
  DATABASE_URL: DB_URL,
  APP_URL:
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000",
  ADMIN_EMAILS: process.env.ADMIN_EMAILS || "",
} as const;

/** Optional: print where we are connecting (sanitized) in dev */
export function logDbTargetOnce() {
  if (!isDev) return;
  // @ts-ignore
  if (globalThis.__DB_LOGGED__) return;
  // @ts-ignore
  globalThis.__DB_LOGGED__ = true;
  try {
    const u = new URL(DB_URL);
    const dbName = u.pathname?.slice(1) || "";
    // Don’t print credentials
    console.info(
      `[db] Using ${u.protocol}//${u.hostname}${u.port ? ":" + u.port : ""}/${dbName}`
    );
  } catch {
    console.info("[db] Using configured DATABASE_URL");
  }
}

/* ------------------------------ M-Pesa config ------------------------------ */
/**
 * Exported as `mpesa` so other modules can:
 *   import { mpesa as ENV, isDev } from "@/app/lib/env";
 */
const MPESA_ENV = (process.env.MPESA_ENV || "sandbox").toLowerCase() as
  | "sandbox"
  | "production";

// Allow explicit override, else derive from env
const derivedBase =
  MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

export const mpesa = {
  environment: MPESA_ENV,
  baseUrl: process.env.MPESA_BASE_URL || derivedBase,

  // Your Paybill or Till number (string to preserve any leading zeros)
  // In sandbox, default to the official LNMO shortcode 174379 if unset.
  shortCode:
    process.env.MPESA_SHORTCODE ||
    (MPESA_ENV === "sandbox" ? "174379" : ""),

  // Lipa Na M-Pesa Online Passkey from Daraja
  passkey: process.env.MPESA_PASSKEY || "",

  // Daraja API credentials
  consumerKey: process.env.MPESA_CONSUMER_KEY || "",
  consumerSecret: process.env.MPESA_CONSUMER_SECRET || "",

  // Public callback URL for STK push results
  callbackUrl:
    process.env.MPESA_CALLBACK_URL ||
    `${(process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "http://localhost:3000")}/api/mpesa/callback`,

  // Default transaction mode ("paybill" for LNMO sandbox 174379; "till" for BuyGoods)
  mode: (process.env.MPESA_MODE || "paybill").toLowerCase() as "till" | "paybill",
} as const;
