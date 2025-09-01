// src/app/api/auth/otp/_store.ts
export type OtpEntry = {
  code: string;
  expiresAt: number; // epoch ms
  attempts: number;
};

type Store = Map<string, OtpEntry>;

const g = globalThis as any;
const store: Store = g.__OTP_MEM_STORE || new Map();
if (!g.__OTP_MEM_STORE) g.__OTP_MEM_STORE = store;

function key(email: string) {
  return email.trim().toLowerCase();
}

export function saveOtp(email: string, code: string, ttlMs = 10 * 60 * 1000) {
  store.set(key(email), { code, expiresAt: Date.now() + ttlMs, attempts: 0 });
}

export function peekOtp(email: string): OtpEntry | null {
  return store.get(key(email)) ?? null;
}

export function verifyOtp(email: string, code: string): "ok" | "expired" | "mismatch" | "missing" {
  const k = key(email);
  const rec = store.get(k);
  if (!rec) return "missing";
  if (Date.now() > rec.expiresAt) {
    store.delete(k);
    return "expired";
  }
  rec.attempts += 1;
  if (rec.code === String(code)) {
    store.delete(k); // consume on success
    return "ok";
  }
  return "mismatch";
}
