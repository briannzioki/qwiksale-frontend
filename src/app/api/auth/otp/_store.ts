// src/app/api/auth/otp/_store.ts
// Helper module (NOT a route): simple in-memory OTP store with TTL.

type OtpRecord = { code: string; expiresAt: number; meta?: Record<string, unknown> };

const STORE = new Map<string, OtpRecord>();
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

function now() {
  return Date.now();
}

export function putOtp(
  key: string,
  code: string,
  ttlMs: number = DEFAULT_TTL_MS,
  meta?: Record<string, unknown>
) {
  const expiresAt = now() + Math.max(1_000, ttlMs);
  const rec: OtpRecord = meta !== undefined
    ? { code, expiresAt, meta }
    : { code, expiresAt }; // <-- omit meta instead of setting undefined
  STORE.set(key, rec);
}

export function getOtp(key: string): OtpRecord | undefined {
  const rec = STORE.get(key);
  if (!rec) return undefined;
  if (rec.expiresAt <= now()) {
    STORE.delete(key);
    return undefined;
  }
  return rec;
}

export function consumeOtp(key: string, code: string): boolean {
  const rec = getOtp(key);
  if (!rec) return false;
  const ok = rec.code === code;
  if (ok) STORE.delete(key);
  return ok;
}

export function purgeExpired() {
  const t = now();
  for (const [k, v] of STORE.entries()) {
    if (v.expiresAt <= t) STORE.delete(k);
  }
}

export function clearAll() {
  STORE.clear();
}
