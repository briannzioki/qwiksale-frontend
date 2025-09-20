export const preferredRegion = 'fra1';
// src/app/api/auth/otp/verify/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

/* ---------------- lazy-load OTP store (avoids TS import errors) ---------------- */

type ThrottleFn = (
  key: string,
  max: number,
  windowSec: number
) => Promise<{ allowed: boolean; remaining: number }>;
type VerifyFn = (email: string, code: string) => Promise<boolean>;

// Safe fallbacks for dev/local if the real store isn’t available
const fallbackThrottle: ThrottleFn = async (_k, max) => ({
  allowed: true,
  remaining: max,
});
const fallbackVerify: VerifyFn = async (_e, _c) => false;

async function loadOtpFns(): Promise<{ throttle: ThrottleFn; verifyAndConsumeOtp: VerifyFn }> {
  try {
    const mod: any = await import("../_store");
    const throttle: ThrottleFn =
      typeof mod?.throttle === "function" ? mod.throttle : fallbackThrottle;
    const verifyAndConsumeOtp: VerifyFn =
      typeof mod?.verifyAndConsumeOtp === "function"
        ? mod.verifyAndConsumeOtp
        : fallbackVerify;
    return { throttle, verifyAndConsumeOtp };
  } catch {
    return { throttle: fallbackThrottle, verifyAndConsumeOtp: fallbackVerify };
  }
}

/* ---------------- analytics (console-only for now) ---------------- */
type AnalyticsEvent =
  | "otp_verify_attempt"
  | "otp_verify_throttled_ip"
  | "otp_verify_invalid_input"
  | "otp_verify_throttled_email"
  | "otp_verify_fail"
  | "otp_verify_success"
  | "otp_verify_mark_verified_success"
  | "otp_verify_mark_verified_error"
  | "otp_verify_error";

function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  try {
    // eslint-disable-next-line no-console
    console.log(`[track] ${event}`, { ts: new Date().toISOString(), ...props });
  } catch {
    /* no-op */
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------------- helpers ---------------- */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function clientIp(req: Request) {
  // Works behind Vercel/Cloudflare proxies
  const h = (name: string) => req.headers.get(name)?.trim() || "";
  return (
    h("x-forwarded-for").split(",")[0] ||
    h("x-real-ip") ||
    h("cf-connecting-ip") ||
    "ip:unknown"
  );
}

/**
 * Accepts both query string and JSON body:
 *   GET/POST ?email=...&code=123456
 *   POST { "email": "...", "code": "123456" }
 * Body fallbacks: Email/Email-like nesting for convenience during integration.
 */
async function extract(req: Request) {
  const url = new URL(req.url);
  const qpEmail =
    url.searchParams.get("email") ??
    url.searchParams.get("e") ??
    url.searchParams.get("mail");
  const qpCode = url.searchParams.get("code") ?? url.searchParams.get("otp");

  let body: any = null;
  if (!qpEmail || !qpCode) {
    body = await req.clone().json().catch(() => null);
  }

  const rawEmail =
    (qpEmail ??
      body?.email ??
      body?.Email ??
      body?.user?.email ??
      body?.data?.email ??
      "") + "";
  const rawCode = (qpCode ?? body?.code ?? body?.otp ?? "") + "";

  const email = rawEmail.trim().toLowerCase();
  const code = rawCode.trim();

  return {
    email: EMAIL_RE.test(email) ? email : "",
    code,
    // safe meta (no PII): whether inputs present, not their values
    meta: {
      hadEmail: !!email,
      hadCode: !!code,
      codeLen: code.length,
    },
  };
}

async function handle(req: Request) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    track("otp_verify_attempt", { reqId, method: req.method });

    // Load OTP helpers (or safe fallbacks)
    const { throttle, verifyAndConsumeOtp } = await loadOtpFns();

    // IP throttle: 20/minute per IP
    const ip = clientIp(req);
    const ipTh = await throttle(`verify:ip:${ip}`, 20, 60);
    if (!ipTh.allowed) {
      track("otp_verify_throttled_ip", { reqId });
      return noStore({ error: "Too many requests" }, { status: 429 });
    }

    // Parse inputs
    const { email, code, meta } = await extract(req);

    // Basic validation
    if (!email || !/^\d{6}$/.test(code)) {
      track("otp_verify_invalid_input", {
        reqId,
        hadEmail: meta.hadEmail,
        hadCode: meta.hadCode,
        codeLen: meta.codeLen,
      });
      return noStore({ error: "Invalid email or code" }, { status: 400 });
    }

    // Per-identifier throttle: 12/5min per email
    const emTh = await throttle(`verify:em:${email}`, 12, 300);
    if (!emTh.allowed) {
      track("otp_verify_throttled_email", { reqId });
      return noStore({ error: "Too many attempts" }, { status: 429 });
    }

    // Verify and consume OTP
    const ok = await verifyAndConsumeOtp(email, code);
    if (!ok) {
      track("otp_verify_fail", { reqId });
      // no enumeration: generic message
      return noStore({ ok: false, message: "Invalid or expired code" }, { status: 400 });
    }

    // If already signed in AND same email, mark verified (best-effort)
    const session = await auth().catch(() => null);
    const sEmail = (session as any)?.user?.email?.toLowerCase?.();
    if (sEmail && sEmail === email) {
      try {
        await prisma.user.update({
          where: { email },
          data: { emailVerified: new Date() as any },
        });
        track("otp_verify_mark_verified_success", { reqId });
      } catch {
        // Schema might not have emailVerified; ignore.
        track("otp_verify_mark_verified_error", { reqId });
      }
    }

    track("otp_verify_success", {
      reqId,
      sessionEmailMatched: !!(sEmail && sEmail === email),
    });
    return noStore({ ok: true });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[auth/otp/verify] error", e);
    track("otp_verify_error", { reqId, message: e?.message ?? String(e) });
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ---------------- route methods ---------------- */
export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}

export async function OPTIONS() {
  // preflight-friendly
  return noStore({ ok: true });
}
