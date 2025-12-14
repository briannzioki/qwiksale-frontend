// src/app/lib/referral-cookie.ts
export const REFERRAL_COOKIE_NAME = "qs_referral";
export const REFERRAL_CODE_RE = /^[A-Za-z0-9._-]{3,64}$/;

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim();
  if (!REFERRAL_CODE_RE.test(code)) return null;
  return code;
}

export function setReferralCookie(code: string): void {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return;

  if (typeof document === "undefined") return;

  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:";

  const parts = [
    `${REFERRAL_COOKIE_NAME}=${encodeURIComponent(normalized)}`,
    "Path=/",
    `Max-Age=${MAX_AGE_SECONDS}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");

  document.cookie = parts.join("; ");
}

export async function readReferralCookie(): Promise<string | null> {
  // Server-only (auth config / route handlers)
  if (typeof window !== "undefined") return null;

  const mod = await import("next/headers");
  const res: any = (mod.cookies as any)();
  const jar: any = typeof res?.then === "function" ? await res : res;

  const v = jar?.get?.(REFERRAL_COOKIE_NAME)?.value;
  if (typeof v !== "string" || !v) return null;

  return normalizeReferralCode(safeDecode(v));
}

export async function clearReferralCookie(): Promise<void> {
  // Client path
  if (typeof document !== "undefined") {
    const secure =
      typeof window !== "undefined" && window.location.protocol === "https:";

    const parts = [
      `${REFERRAL_COOKIE_NAME}=`,
      "Path=/",
      "Max-Age=0",
      "SameSite=Lax",
    ];
    if (secure) parts.push("Secure");

    document.cookie = parts.join("; ");
    return;
  }

  // Server path
  const mod = await import("next/headers");
  const res: any = (mod.cookies as any)();
  const jar: any = typeof res?.then === "function" ? await res : res;

  jar?.set?.(REFERRAL_COOKIE_NAME, "", {
    path: "/",
    expires: new Date(0),
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
