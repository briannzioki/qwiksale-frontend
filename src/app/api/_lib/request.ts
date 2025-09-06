// src/app/api/_lib/request.ts
import { headers } from "next/headers";

/**
 * A minimal compatible shape for Next.js ReadonlyHeaders.
 * We don't import types from "next" to keep this file universal.
 */
export type ReadonlyHeaders = {
  get(name: string): string | null;
  has(name: string): boolean;
  entries(): IterableIterator<[string, string]>;
  keys(): IterableIterator<string>;
  values(): IterableIterator<string>;
  forEach(
    callbackfn: (value: string, key: string, parent: ReadonlyHeaders) => void,
    thisArg?: any
  ): void;
  [Symbol.iterator](): IterableIterator<[string, string]>;
};

/* -----------------------------------------------------------------------------
   Internals
----------------------------------------------------------------------------- */

function splitCsv(v: string | null | undefined): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Normalize headers() which can be sync or async in different Next versions. */
async function getReqHeaders(): Promise<ReadonlyHeaders> {
  const h = headers() as unknown;
  // In Next 15, headers() can return a promise in some contexts.
  return (h && typeof (h as any).then === "function")
    ? ((await h) as ReadonlyHeaders)
    : (h as ReadonlyHeaders);
}

function firstIpFromXFF(xff: string | null | undefined): string | null {
  const first = splitCsv(xff)[0];
  return first || null;
}

function looksLikeIp(s: string | null | undefined): boolean {
  if (!s) return false;
  // Very relaxed check for IPv4/IPv6 (keeps private/local; caller decides)
  return /^[\d.:a-fA-F]+$/.test(s);
}

/* -----------------------------------------------------------------------------
   Public helpers
----------------------------------------------------------------------------- */

/**
 * Return a *best effort* client IP. Trusts standard proxy headers:
 * - x-forwarded-for (handles multi-hop; picks first)
 * - x-real-ip
 * - cf-connecting-ip (Cloudflare)
 *
 * Falls back to 127.0.0.1 when unknown.
 *
 * NOTE: This is for logging/rate-limit keys. Do NOT use as a security boundary.
 */
export async function clientIp(): Promise<string> {
  const h = await getReqHeaders();
  const ip =
    firstIpFromXFF(h.get("x-forwarded-for")) ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    null;

  return (looksLikeIp(ip) ? ip : null) ?? "127.0.0.1";
}

/**
 * Build a stable key for throttling / rate-limiting:
 *   `${prefix}:${userIdOrAnon}:${clientIp}`
 *
 * You can pass a known user id to make limits fairer for logged-in users.
 */
export async function clientKey(prefix: string, userId?: string | null): Promise<string> {
  const ip = await clientIp();
  const uid = userId && userId.trim() ? userId.trim() : "anon";
  return `${prefix}:${uid}:${ip}`;
}

/** Simple wrapper for User-Agent (may be null). */
export async function userAgent(): Promise<string | null> {
  const h = await getReqHeaders();
  return h.get("user-agent");
}

/** Returns the Origin header if present (CORS / same-site form posts). */
export async function requestOrigin(): Promise<string | null> {
  const h = await getReqHeaders();
  return h.get("origin");
}

/** Returns the Referer (sic) header if present. */
export async function requestReferrer(): Promise<string | null> {
  const h = await getReqHeaders();
  return h.get("referer") ?? h.get("referrer"); // some proxies normalize
}

/** x-forwarded-proto | forwarded proto | fallback "https" in prod, else "http". */
export async function requestProtocol(): Promise<"http" | "https"> {
  const h = await getReqHeaders();
  const proto =
    h.get("x-forwarded-proto") ||
    // Forwarded: proto=https; host=example.com  (RFC 7239)
    (h.get("forwarded")?.match(/proto=([^;]+)/)?.[1]) ||
    (process.env.NODE_ENV === "production" ? "https" : "http");

  return proto.toLowerCase() === "https" ? "https" : "http";
}

/** x-forwarded-host | host | (dev fallback) "localhost:3000". */
export async function requestHost(): Promise<string> {
  const h = await getReqHeaders();
  return (
    h.get("x-forwarded-host") ||
    h.get("host") ||
    process.env["VERCEL_URL"] || // e.g. my-app.vercel.app (no protocol)
    "localhost:3000"
  );
}

/** Builds a base URL like "https://example.com". */
export async function baseUrl(): Promise<string> {
  // Prefer explicit env (useful for emails/absolute links)
  const env =
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["APP_URL"] ||
    process.env["SITE_URL"] ||
    "";

  if (env) {
    // Ensure no trailing slash
    const cleaned = env.replace(/\/+$/, "");
    // If someone set VERCEL_URL-like host without scheme, add protocol
    if (!/^https?:\/\//i.test(cleaned)) {
      const proto = await requestProtocol();
      return `${proto}://${cleaned}`;
    }
    return cleaned;
  }

  const proto = await requestProtocol();
  const host = await requestHost();
  // If env provided only host (like "my-app.vercel.app"), ensure protocol
  if (/^https?:\/\//i.test(host)) {
    return host.replace(/\/+$/, "");
  }
  return `${proto}://${host}`;
}

/**
 * Check if request Origin is allowed (CORS-ish). Provide a comma-separated
 * list via ALLOWED_ORIGINS="https://app.example.com,https://www.example.com".
 */
export async function isTrustedOrigin(): Promise<boolean> {
  const origin = await requestOrigin();
  if (!origin) return false;
  const allowed = (process.env["ALLOWED_ORIGINS"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true; // nothing configured => allow
  return allowed.some((o) => o.toLowerCase() === origin.toLowerCase());
}

/**
 * Get all candidate IPs (useful for debugging). First item is what `clientIp()`
 * would return.
 */
export async function clientIps(): Promise<string[]> {
  const h = await getReqHeaders();
  const xff = splitCsv(h.get("x-forwarded-for"));
  const list = [
    firstIpFromXFF(h.get("x-forwarded-for")),
    h.get("x-real-ip"),
    h.get("cf-connecting-ip"),
    ...xff.slice(1),
  ].filter(Boolean) as string[];
  // Deduplicate while preserving order
  return Array.from(new Set(list));
}
