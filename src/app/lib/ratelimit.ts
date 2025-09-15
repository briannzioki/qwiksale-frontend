// src/app/lib/ratelimit.ts
type Bucket = { count: number; resetAt: number };

const g = globalThis as unknown as {
  __qs_rl__?: Map<string, Bucket>;
};

const store: Map<string, Bucket> = g.__qs_rl__ ?? new Map();
if (!g.__qs_rl__) g.__qs_rl__ = store;

export function ipFromHeaders(h: Headers): string | null {
  const xf =
    h.get("x-forwarded-for") ||
    h.get("x-vercel-forwarded-for") ||
    h.get("x-real-ip") ||
    "";
  if (!xf) return null;
  return xf.split(",")[0]?.trim() || null;
}

export type RLParams = {
  /** Logical bucket name, e.g. "products_search" */
  name: string;
  /** Max requests per window */
  limit: number;
  /** Window length in ms */
  windowMs: number;
  /** Optional stronger block after window is exceeded */
  blockMs?: number;
  /** Extra key bits (e.g. userId) to add specificity */
  extraKey?: string | null | undefined;
};

/** returns { ok, retryAfterSec } */
export function checkRateLimit(headers: Headers, p: RLParams) {
  const ip = ipFromHeaders(headers) ?? "anon";
  const key = `${p.name}:${ip}${p.extraKey ? `:${p.extraKey}` : ""}`;

  const now = Date.now();
  const cur = store.get(key);
  if (!cur || now > cur.resetAt) {
    store.set(key, { count: 1, resetAt: now + p.windowMs });
    return { ok: true, retryAfterSec: Math.ceil(p.windowMs / 1000) };
  }
  if (cur.count < p.limit) {
    cur.count += 1;
    return { ok: true, retryAfterSec: Math.ceil((cur.resetAt - now) / 1000) };
  }

  // Optional “cooldown” extension after being blocked
  if (p.blockMs && cur.resetAt - now < p.blockMs) {
    cur.resetAt = now + p.blockMs;
  }
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) };
}
