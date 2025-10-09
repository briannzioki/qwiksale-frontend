// src/app/api/_lib/guard.ts
import { rateLimit } from "@/app/api/_lib/ratelimits";
import { clientKey } from "./request";

/**
 * Basic rate guard for any scope. Returns `Response` when limited,
 * or `null` to indicate “go ahead”.
 */
export async function guardRate(req: Request, scope: string) {
  const key = await clientKey(scope);
  const { success, reset } = await rateLimit.limit(key);
  if (!success) {
    return new Response("Slow down", {
      status: 429,
      headers: { "Retry-After": String(reset) },
    });
  }
  return null;
}

/**
 * Helper: only apply the limiter for write methods (POST/PATCH/DELETE).
 * Useful so public GETs (like /api/services/:id) are never throttled.
 */
export async function guardWriteRate(req: Request, scope: string) {
  const m = (req.method || "GET").toUpperCase();
  const isWrite = m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
  return isWrite ? guardRate(req, scope) : null;
}
