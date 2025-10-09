/** Minimal interface: anything with a .get() like Headers */
type HeaderLike = { get(name: string): string | null };

/**
 * Super-light idempotency helper for Server Actions & route handlers.
 * Looks for: 'Idempotency-Key' | 'X-Idempotency-Key'
 * Stores short-lived results in a global Map (per instance).
 */
type Entry = { ts: number; result: unknown };

const DEFAULT_TTL_MS = 60_000; // 1 minute (can override per call)

// Per-instance globals
const g = global as unknown as {
  __idem_cache__?: Map<string, Entry>;
  __idem_pending__?: Map<string, Promise<unknown>>;
};

if (!g.__idem_cache__) g.__idem_cache__ = new Map();
if (!g.__idem_pending__) g.__idem_pending__ = new Map();

const cache = g.__idem_cache__!;
const pending = g.__idem_pending__!;

/**
 * Get idempotency key from a Request-like object (preferred).
 * Synchronous by design, so unit tests and route handlers don’t need to await.
 *
 * If you don’t pass `req`, we simply return null (we avoid calling next/headers
 * here because it can be async in newer Next versions).
 */
export function getIdempotencyKey(req?: { headers?: HeaderLike } | Request): string | null {
  const h: HeaderLike | undefined = (req as any)?.headers;
  if (!h || typeof h.get !== "function") return null;

  const k =
    h.get("Idempotency-Key") ||
    h.get("X-Idempotency-Key") ||
    h.get("x-idempotency-key") ||
    null;

  return k && k.trim() ? k.trim() : null;
}

/** Remove expired entries (handy for tests). Returns number of deleted keys. */
export function purgeExpired(ttlMs: number = DEFAULT_TTL_MS): number {
  const now = Date.now();
  let removed = 0;
  for (const [k, v] of cache) {
    if (now - v.ts > ttlMs) {
      cache.delete(k);
      removed++;
    }
  }
  return removed;
}

/**
 * Run `run()` at most once per key within ttlMs.
 * - If `key` is null, always runs.
 * - Only successful results are cached (errors are never cached).
 * - Concurrent calls with the same key share the same in-flight Promise.
 * - TTL can be overridden per call.
 */
export async function withIdempotency<T>(
  key: string | null,
  run: () => Promise<T> | T,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  // Periodically sweep old cache entries
  purgeExpired(ttlMs);

  // No key: always execute
  if (!key) return await run();

  const now = Date.now();

  // Serve fresh cache hit
  const hit = cache.get(key);
  if (hit && now - hit.ts <= ttlMs) {
    return hit.result as T;
  }

  // Share in-flight work if present
  const inFlight = pending.get(key);
  if (inFlight) {
    return (await inFlight) as T;
  }

  // Start new work and register it as pending
  const p = (async () => {
    try {
      const value = await run();
      cache.set(key, { ts: Date.now(), result: value });
      return value;
    } finally {
      // Ensure we always clear the pending slot, success or failure
      pending.delete(key);
    }
  })();

  pending.set(key, p);

  // Only cache on success; errors bubble up
  return (await p) as T;
}
