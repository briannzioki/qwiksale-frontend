// src/app/api/_lib/ratelimits.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Production limiter (10 req / minute per key).
 * Falls back to a no-op limiter if Upstash env vars aren’t set
 * so local/dev won’t crash.
 */

function makeLimiter() {
  try {
    // Will throw if env vars missing; we catch and return a noop limiter
    const redis = Redis.fromEnv();
    return new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      analytics: true,
      prefix: "qwiksale",
    });
  } catch {
    // No-op limiter for local/dev without Upstash
    return {
      limit: async (_key: string) => ({ success: true, limit: 10, remaining: 10, reset: 0 }),
    } as Pick<Ratelimit, "limit">;
  }
}

export const rateLimit = makeLimiter();

/**
 * Helper: rate limit by IP or any custom key string.
 * Usage:
 *   const ok = await limitByKey(`report:${ip}`, 5, "1 m");
 */
export async function limitByKey(key: string, max = 10, window = "1 m") {
  // If you want per-route custom windows, create a fresh limiter here.
  // Otherwise reuse the global one:
  return rateLimit.limit(`${key}`);
}
