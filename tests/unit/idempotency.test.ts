// tests/unit/idempotency.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withIdempotency, getIdempotencyKey, purgeExpired } from "@/app/lib/idempotency";

function makeReq(headers: Record<string, string>): any {
  return {
    headers: {
      get: (k: string) => headers[k] ?? headers[k.toLowerCase()] ?? null,
    },
  } as any;
}

describe("idempotency utils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("getIdempotencyKey reads Idempotency-Key and X-Idempotency-Key", () => {
    const req1 = makeReq({ "Idempotency-Key": "abc-123" });
    const req2 = makeReq({ "X-Idempotency-Key": "xyz-789" });
    const req3 = makeReq({});

    expect(getIdempotencyKey(req1)).toBe("abc-123");
    expect(getIdempotencyKey(req2)).toBe("xyz-789");
    expect(getIdempotencyKey(req3)).toBeNull?.() ?? expect(getIdempotencyKey(req3)).toBe(null);
  });

  it("caches first result and returns same on replay without re-running", async () => {
    const key = "create:product:1";
    const spy = vi.fn().mockResolvedValue({ ok: true, id: "p_1" });

    const r1 = await withIdempotency(key, spy);
    const r2 = await withIdempotency(key, spy); // replay/cached

    expect(r1).toEqual({ ok: true, id: "p_1" });
    expect(r2).toEqual({ ok: true, id: "p_1" });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent calls (single execution) and shares the same result", async () => {
    const key = "create:service:bulk";
    const spy = vi.fn().mockImplementation(async () => {
      await new Promise(res => setTimeout(res, 10));
      return { ok: true, sid: "s_42" };
    });

    const concurrent = Array.from({ length: 10 }, () => withIdempotency(key, spy));
    const allP = Promise.all(concurrent);
    vi.advanceTimersByTime(20);
    const results = await allP;

    expect(spy).toHaveBeenCalledTimes(1);
    for (const r of results) {
      expect(r).toEqual({ ok: true, sid: "s_42" });
    }
  });

  it("respects ttlMs: re-executes after TTL expiry", async () => {
    const key = "create:product:ttl";
    const spy = vi.fn().mockResolvedValue({ ok: true, id: "p_ttl" });

    const ttlMs = 5000;

    const r1 = await withIdempotency(key, spy, ttlMs);
    expect(r1).toEqual({ ok: true, id: "p_ttl" });
    expect(spy).toHaveBeenCalledTimes(1);

    // Within TTL → returns cached, no re-run
    vi.advanceTimersByTime(ttlMs - 1);
    const r2 = await withIdempotency(key, spy, ttlMs);
    expect(r2).toEqual({ ok: true, id: "p_ttl" });
    expect(spy).toHaveBeenCalledTimes(1);

    // After TTL → runs again
    vi.advanceTimersByTime(2);
    const r3 = await withIdempotency(key, spy, ttlMs);
    expect(r3).toEqual({ ok: true, id: "p_ttl" });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("purgeExpired() clears old entries so they’re recomputed", async () => {
    const key = "create:service:purge";
    const ttlMs = 1000;
    const spy = vi.fn().mockResolvedValue({ ok: true, sid: "s_old" });

    await withIdempotency(key, spy, ttlMs);
    expect(spy).toHaveBeenCalledTimes(1);

    // age past TTL and purge
    vi.advanceTimersByTime(ttlMs + 1);
    await purgeExpired();

    // next call re-executes
    const spy2 = vi.fn().mockResolvedValue({ ok: true, sid: "s_new" });
    const r = await withIdempotency(key, spy2, ttlMs);
    expect(r).toEqual({ ok: true, sid: "s_new" });
    expect(spy2).toHaveBeenCalledTimes(1);
  });

  it("propagates handler errors on first call and still allows retry to run again", async () => {
    const key = "create:product:error";
    const err = new Error("boom");
    const bad = vi.fn().mockRejectedValue(err);

    await expect(withIdempotency(key, bad)).rejects.toThrow("boom");
    expect(bad).toHaveBeenCalledTimes(1);

    const ok = vi.fn().mockResolvedValue({ ok: true, id: "p_ok" });
    const r = await withIdempotency(key, ok);
    expect(r).toEqual({ ok: true, id: "p_ok" });
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
