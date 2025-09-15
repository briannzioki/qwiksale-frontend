// src/app/lib/ratelimit.ts
import type { Ratelimit as UpstashRateLimit } from "@upstash/ratelimit";
import type { Redis as UpstashRedis } from "@upstash/redis";

/**
 * We only construct the Upstash clients if BOTH env vars are present.
 * This avoids the noisy “[Upstash Redis] missing …” warnings at build time.
 */
const UPSTASH_URL = process.env["UPSTASH_REDIS_REST_URL"] || "";
const UPSTASH_TOKEN = process.env["UPSTASH_REDIS_REST_TOKEN"] || "";

let upstashRedis: UpstashRedis | null = null;
let RatelimitCtor:
  | (new (args: {
      redis: UpstashRedis;
      limiter: ReturnType<typeof import("@upstash/ratelimit").Ratelimit.slidingWindow>;
      analytics?: boolean;
      prefix?: string;
    }) => UpstashRateLimit)
  | null = null;

if (UPSTASH_URL && UPSTASH_TOKEN) {
  // Lazy require so we don't even import the packages if not configured
  // (helps local dev / tests, and avoids logs during static generation).
  const { Redis } = require("@upstash/redis") as typeof import("@upstash/redis");
  const { Ratelimit } = require("@upstash/ratelimit") as typeof import("@upstash/ratelimit");

  upstashRedis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
  RatelimitCtor = Ratelimit as unknown as typeof Ratelimit;
}

/* ----------------------- Header helpers & IP parse ----------------------- */

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

/** What we return to the caller */
export type RLResult = { ok: boolean; retryAfterSec: number };

/* --------------------------- In-memory fallback -------------------------- */

type Bucket = { count: number; resetAt: number };
const g = globalThis as unknown as { __qs_rl__?: Map<string, Bucket> };
const memoryStore: Map<string, Bucket> = g.__qs_rl__ ?? new Map();
if (!g.__qs_rl__) g.__qs_rl__ = memoryStore;

function memoryCheck(key: string, p: RLParams, now: number): RLResult {
  const cur = memoryStore.get(key);
  if (!cur || now > cur.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + p.windowMs });
    return { ok: true, retryAfterSec: Math.ceil(p.windowMs / 1000) };
  }
  if (cur.count < p.limit) {
    cur.count += 1;
    return { ok: true, retryAfterSec: Math.ceil((cur.resetAt - now) / 1000) };
  }
  if (p.blockMs && cur.resetAt - now < p.blockMs) {
    cur.resetAt = now + p.blockMs;
  }
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) };
}

/* --------------------------------- Main ---------------------------------- */

/**
 * Universal checker: uses Upstash if configured, otherwise a process-memory Map.
 * Returns `{ ok, retryAfterSec }`.
 */
export async function checkRateLimit(headers: Headers, p: RLParams): Promise<RLResult> {
  const ip = ipFromHeaders(headers) ?? "anon";
  const key = `${p.name}:${ip}${p.extraKey ? `:${p.extraKey}` : ""}`;

  // Fast path: Upstash present
  if (upstashRedis && RatelimitCtor) {
    // Construct a small ratelimiter for the window/limit provided.
    // The constructor + Redis client are light and safe to reuse; but even if
    // created per-call, @upstash/redis handles connection reuse underneath.
    const { Ratelimit } = require("@upstash/ratelimit") as typeof import("@upstash/ratelimit");
    const rl = new RatelimitCtor({
      redis: upstashRedis,
      limiter: Ratelimit.slidingWindow(p.limit, p.windowMs / 1000), // seconds
      prefix: `rl:${p.name}`,
      analytics: false,
    });

    const res = await rl.limit(key);
    if (res.success) {
      // Estimate: time until the window fully resets for this key
      const retryAfterSec = res.reset ? Math.max(1, Math.ceil((res.reset - Date.now()) / 1000)) : Math.ceil(p.windowMs / 1000);
      return { ok: true, retryAfterSec };
    }

    const retryAfterSec =
      res.reset ? Math.max(1, Math.ceil((res.reset - Date.now()) / 1000)) : Math.ceil(p.windowMs / 1000);

    // Optional extended cooldown
    if (p.blockMs && res.reset && res.reset - Date.now() < p.blockMs) {
      // “Extend” by writing a small key with TTL (best-effort)
      try {
        await upstashRedis!.set(`rlblock:${key}`, "1", { ex: Math.ceil(p.blockMs / 1000) });
      } catch {
        /* ignore */
      }
    }
    return { ok: false, retryAfterSec };
  }

  // Fallback: in-memory Map (single-process only)
  return memoryCheck(key, p, Date.now());
}

/**
 * Helper to apply common rate-limit headers on a Response (optional).
 */
export function withRateLimitHeaders(
  res: Response,
  params: RLParams,
  result: RLResult
): Response {
  const h = new Headers(res.headers);
  h.set("X-RateLimit-Limit", String(params.limit));
  h.set("X-RateLimit-Window", String(Math.ceil(params.windowMs / 1000)));
  h.set("X-RateLimit-Remaining", result.ok ? "1" : "0");
  h.set("Retry-After", String(result.retryAfterSec));
  return new Response(res.body, { status: res.status, headers: h });
}
