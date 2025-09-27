// src/app/lib/url.ts

/** Normalize and return the site base URL (no trailing slash). */
export function getBaseUrl(): string {
  // Prefer the unified var; fall back to legacy if someone still has it set.
  const explicit =
    process.env['NEXT_PUBLIC_APP_URL'] ||
    process.env['NEXT_PUBLIC_APP_URL'] || // legacy fallback (won’t be needed once fully migrated)
    "";

  const vercel = process.env['VERCEL_URL'] || "";

  // Vercel gives domain only; add protocol. Local dev fallback stays explicit.
  const base =
    explicit ||
    (vercel ? (vercel.startsWith("http") ? vercel : `https://${vercel}`) : "") ||
    "http://127.0.0.1:3000";

  // Strip trailing slashes
  return base.replace(/\/+$/, "");
}

/** Build an absolute URL string from a path (safe on server & edge). */
export function makeAbsoluteUrl(path: string): string {
  const base = getBaseUrl();
  return new URL(path, base).toString();
}

/** Alias used by server code to hit internal API routes with absolute URLs. */
export const makeApiUrl = makeAbsoluteUrl;
