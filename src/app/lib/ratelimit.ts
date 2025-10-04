// src/app/lib/ratelimit.ts
import type { Ratelimit as UpstashRateLimit } from "@upstash/ratelimit";
import type { Redis as UpstashRedis } from "@upstash/redis";

/**
 * Only construct Upstash clients if BOTH env vars exist to avoid noisy build warnings.
 */
const UPSTASH_URL = process.env["UPSTASH_REDIS_REST_URL"] || "";
const UPSTASH_TOKEN = process.env["UPSTASH_REDIS_REST_TOKEN"] || "";

let upstashRedis: UpstashRedis | null = null;
let RatelimitClass:
  | (new (args: {
      redis: UpstashRedis;
      limiter: ReturnType<typeof import("@upstash/ratelimit").Ratelimit.slidingWindow>;
      analytics?: boolean;
      prefix?: string;
    }) => UpstashRateLimit)
  | null = null;

if (UPSTASH_URL && UPSTASH_TOKEN) {
  const { Redis } = require("@upstash/redis") as typeof import("@upstash/redis");
  const { Ratelimit } = require("@upstash/ratelimit") as typeof import("@upstash/ratelimit");
  upstashRedis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
  RatelimitClass = Ratelimit as unknown as typeof Ratelimit;
}

/* ----------------------- Header helpers & IP parse ----------------------- */

export function ipFromHeaders(h: Headers): string | null {
  const xf =
    h.get("cf-connecting-ip") ||
    h.get("x-forwarded-for") ||
    h.get("x-vercel-forwarded-for") ||
    h.get("x-real-ip") ||
    h.get("x-client-ip") ||
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

/** Return shape (retryAfterSec kept present for simplicity with your callers) */
export type RLResult = { ok: boolean; retryAfterSec: number; remaining?: number };

/* --------------------------- In-memory fallback -------------------------- */

type Bucket = { count: number; resetAt: number };
const g = globalThis as unknown as { __qs_rl__?: Map<string, Bucket> };
const memoryStore: Map<string, Bucket> = g.__qs_rl__ ?? new Map();
if (!g.__qs_rl__) g.__qs_rl__ = memoryStore;

function memoryCheck(key: string, p: RLParams, now: number): RLResult {
  const cur = memoryStore.get(key);
  if (!cur || now > cur.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + p.windowMs });
    return { ok: true, retryAfterSec: Math.ceil(p.windowMs / 1000), remaining: p.limit - 1 };
  }
  if (cur.count < p.limit) {
    cur.count += 1;
    return {
      ok: true,
      retryAfterSec: Math.ceil((cur.resetAt - now) / 1000),
      remaining: Math.max(0, p.limit - cur.count),
    };
  }
  if (p.blockMs && cur.resetAt - now < p.blockMs) {
    cur.resetAt = now + p.blockMs;
  }
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)), remaining: 0 };
}

/* --------------------------------- Main ---------------------------------- */

/**
 * Universal checker: uses Upstash if configured, otherwise a process-memory Map.
 * Returns `{ ok, retryAfterSec }` (and optionally `remaining`).
 */
export async function checkRateLimit(headers: Headers, p: RLParams): Promise<RLResult> {
  const ip = ipFromHeaders(headers) ?? "anon";
  const key = `${p.name}:${ip}${p.extraKey ? `:${p.extraKey}` : ""}`;

  // Fast path: Upstash present
  if (upstashRedis && RatelimitClass) {
    const { Ratelimit } = require("@upstash/ratelimit") as typeof import("@upstash/ratelimit");

    // Block-list check (we store absolute-until timestamp for accurate Retry-After)
    if (p.blockMs) {
      try {
        const blockedUntilStr = await (upstashRedis as any).get(`rlblock:${key}`);
        const blockedUntil = blockedUntilStr ? Number(blockedUntilStr) : 0;
        const remainingMs = blockedUntil - Date.now();
        if (remainingMs > 0) {
          return { ok: false, retryAfterSec: Math.max(1, Math.ceil(remainingMs / 1000)), remaining: 0 };
        }
      } catch {
        /* ignore */
      }
    }

    // Upstash expects Duration like "60 s", not a number.
    const seconds = Math.max(1, Math.round(p.windowMs / 1000));
    const rl = new RatelimitClass({
      redis: upstashRedis,
      limiter: Ratelimit.slidingWindow(p.limit, `${seconds} s`),
      prefix: `rl:${p.name}`,
      analytics: false,
    });

    const res = await rl.limit(key);
    const retryAfterSec = res.reset
      ? Math.max(1, Math.ceil((res.reset - Date.now()) / 1000))
      : seconds;

    if (res.success) {
      const remaining = typeof (res as any).remaining === "number" ? (res as any).remaining : undefined;
      return { ok: true, retryAfterSec, remaining };
    }

    // Optional extended cooldown: store absolute until timestamp
    if (p.blockMs) {
      try {
        const until = Date.now() + p.blockMs;
        await (upstashRedis as any).set(`rlblock:${key}`, String(until), { ex: Math.ceil(p.blockMs / 1000) });
      } catch {
        /* ignore */
      }
    }
    return { ok: false, retryAfterSec, remaining: 0 };
  }

  // Fallback: in-memory Map (single-process only)
  return memoryCheck(key, p, Date.now());
}

/**
 * Helper to apply common rate-limit headers on a Response (optional).
 */
export function withRateLimitHeaders(res: Response, params: RLParams, result: RLResult): Response {
  const h = new Headers(res.headers);
  h.set("X-RateLimit-Limit", String(params.limit));
  h.set("X-RateLimit-Window", String(Math.ceil(params.windowMs / 1000)));
  if (typeof result.remaining === "number") {
    h.set("X-RateLimit-Remaining", String(result.remaining));
  }
  h.set("Retry-After", String(result.retryAfterSec));
  return new Response(res.body, { status: res.status, headers: h });
}
