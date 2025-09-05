// src/app/api/auth/otp/_store.ts
import { createHash } from "crypto";

type Store = {
  saveOtp(email: string, code: string, ttlMs: number): Promise<void>;
  verifyAndConsumeOtp(email: string, code: string): Promise<boolean>;
  throttle(key: string, max: number, windowSec: number): Promise<{ allowed: boolean; remaining: number }>;
};

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// --- Redis (Upstash) if available ---
let store: Store;

async function makeRedisStore(): Promise<Store | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const base = async (path: string, body: any) => {
    const res = await fetch(`${url}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Upstash error ${res.status}`);
    return res.json();
  };

  const keyOTP = (email: string) => `otp:email:${email}`;
  const keyTH = (k: string) => `otp:throttle:${k}`;

  return {
    async saveOtp(email, code, ttlMs) {
      const value = sha256(code);
      // SET key value EX ttl
      await base("set", { key: keyOTP(email), value, ex: Math.ceil(ttlMs / 1000) });
    },
    async verifyAndConsumeOtp(email, code) {
      const k = keyOTP(email);
      const r = await base("get", { key: k });
      const stored: string | null = r.result ?? null;
      if (!stored) return false;
      const ok = stored === sha256(code);
      if (ok) await base("del", { key: k });
      return ok;
    },
    async throttle(key, max, windowSec) {
      // Simple counter with expire
      const k = keyTH(key);
      // INCR
      const incr = await base("incr", { key: k });
      if (incr.result === 1) {
        await base("pexpire", { key: k, milliseconds: windowSec * 1000 });
      }
      const count = Number(incr.result ?? 1);
      return { allowed: count <= max, remaining: Math.max(0, max - count) };
    },
  };
}

// --- In-memory fallback (dev only) ---
function makeMemoryStore(): Store {
  const map = new Map<string, { hash: string; exp: number }>();
  const th = new Map<string, { count: number; exp: number }>();

  const keyOTP = (email: string) => `otp:email:${email}`;
  const keyTH = (k: string) => `otp:th:${k}`;

  const now = () => Date.now();

  return {
    async saveOtp(email, code, ttlMs) {
      map.set(keyOTP(email), { hash: sha256(code), exp: now() + ttlMs });
    },
    async verifyAndConsumeOtp(email, code) {
      const k = keyOTP(email);
      const v = map.get(k);
      if (!v) return false;
      if (now() > v.exp) {
        map.delete(k);
        return false;
      }
      const ok = v.hash === sha256(code);
      if (ok) map.delete(k);
      return ok;
    },
    async throttle(key, max, windowSec) {
      const k = keyTH(key);
      const v = th.get(k);
      const t = now();
      if (!v || t > v.exp) {
        th.set(k, { count: 1, exp: t + windowSec * 1000 });
        return { allowed: true, remaining: max - 1 };
      }
      v.count += 1;
      return { allowed: v.count <= max, remaining: Math.max(0, max - v.count) };
    },
  };
}

const init = await makeRedisStore();
store = init ?? makeMemoryStore();

export async function saveOtp(email: string, code: string, ttlMs: number) {
  return store.saveOtp(email.toLowerCase(), code, ttlMs);
}

export async function verifyAndConsumeOtp(email: string, code: string) {
  return store.verifyAndConsumeOtp(email.toLowerCase(), code);
}

export async function throttle(key: string, max: number, windowSec: number) {
  return store.throttle(key, max, windowSec);
}
