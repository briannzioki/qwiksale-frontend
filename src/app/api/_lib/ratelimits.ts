// src/app/api/_lib/ratelimits.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Lightweight helpers for rate limiting with Upstash Redis.
 * - If Upstash env vars are missing, everything degrades to a no-op limiter.
 * - Default/global limiter: 10 requests / minute per key.
 * - You can also create per-route custom windows without reusing the global one.
 */

/* ----------------------------------------------------------------------------
 * Minimal structural types (avoid importing non-exported SDK types)
 * --------------------------------------------------------------------------*/

/** Minimal shape we actually use from the SDK's limit() return. */
type RatelimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;           // epoch millis
  /** Upstash returns a Promise here; allow any/unknown for structural compatibility */
  pending?: unknown;
};

/** Options are not used by us, but keep a placeholder for compatibility. */
type LimitOpts = { rate?: number };

/** Only the `limit` method is needed for our helpers. */
type LimiterLike = {
  limit: (identifier: string, req?: LimitOpts) => Promise<RatelimitResult>;
};

/* ----------------------------------------------------------------------------
 * Safe Upstash initialization
 * --------------------------------------------------------------------------*/

function makeRedis(): Redis | null {
  try {
    // Uses UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
    return Redis.fromEnv();
  } catch {
    return null;
  }
}

const redis = makeRedis();

/** A tiny no-op limiter used in local/dev when Upstash isn't configured. */
const noopLimiter: LimiterLike = {
  limit: async (_key: string) =>
    Promise.resolve({
      success: true,
      limit: 10,
      remaining: 10,
      reset: Date.now() + 60_000,
      pending: 0, // number is fine; structural type allows unknown
    }),
};

/** Global default limiter: 10 req / minute per key. */
export const rateLimit: LimiterLike =
  redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "1 m"),
        analytics: true,
        prefix: "qwiksale",
      })
    : noopLimiter;

/* ----------------------------------------------------------------------------
 * Per-route custom limiters (cached by (max, window, prefix))
 * --------------------------------------------------------------------------*/

const cache = new Map<string, LimiterLike>();

/**
 * Get (or create) a custom limiter with its own window.
 * Example:
 *   const rl = getLimiter(5, "30 s", "qs:otp");
 *   const res = await rl.limit("start:ip:1.2.3.4");
 */
export function getLimiter(
  max: number,
  window: `${number} ${"s" | "m" | "h" | "d"}`,
  prefix = "qwiksale"
): LimiterLike {
  if (!redis) return noopLimiter;
  const key = `${max}|${window}|${prefix}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(max, window),
    analytics: true,
    prefix,
  });
  cache.set(key, rl);
  return rl;
}

/* ----------------------------------------------------------------------------
 * Key builders
 * --------------------------------------------------------------------------*/

/** Very simple header-based IP extraction (works on Vercel/NGINX/CF). */
export function ipFromRequest(req: Request): string {
  const xf = req.headers.get("x-forwarded-for") || "";
  const ip =
    xf.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "ip:unknown";
  return ip;
}

/**
 * Compose a fair key that includes user id when available.
 * Example:
 *   const key = composeKey("report", { userId, ip });
 */
export function composeKey(
  prefix: string,
  ids: { userId?: string | null; ip?: string | null }
) {
  const uid = (ids.userId ?? "anon").trim() || "anon";
  const ip = (ids.ip ?? "ip:unknown").trim() || "ip:unknown";
  return `${prefix}:${uid}:${ip}`;
}

/* ----------------------------------------------------------------------------
 * Convenience wrappers
 * --------------------------------------------------------------------------*/

/** Rate limit with the global (10/min) limiter by any string key. */
export async function limitByKey(key: string) {
  return rateLimit.limit(key);
}

/** Rate limit with a custom window (creates a cached limiter under the hood). */
export async function limitCustom(
  key: string,
  max: number,
  window: `${number} ${"s" | "m" | "h" | "d"}`,
  prefix = "qwiksale"
) {
  return getLimiter(max, window, prefix).limit(key);
}

/**
 * Per-request helper (global 10/min):
 * Example:
 *   const ip = ipFromRequest(req);
 *   const r = await limitByRequest("support", req, userId);
 */
export async function limitByRequest(
  prefix: string,
  req: Request,
  userId?: string | null
) {
  const ip = ipFromRequest(req);
  const uid: string | null = userId ?? null; // normalize to satisfy exactOptionalPropertyTypes
  return rateLimit.limit(composeKey(prefix, { userId: uid, ip }));
}
