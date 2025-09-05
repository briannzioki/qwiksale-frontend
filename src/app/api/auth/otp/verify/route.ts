// src/app/api/auth/otp/verify/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { verifyAndConsumeOtp, throttle } from "../_store";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

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

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

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

    // throttles
    const ip =
      (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
      "ip:unknown";
    const ipTh = await throttle(`verify:ip:${ip}`, 20, 60); // 20/min/IP
    if (!ipTh.allowed) {
      track("otp_verify_throttled_ip", { reqId });
      return noStore({ error: "Too many requests" }, { status: 429 });
    }

    const { email, code, meta } = await extract(req);

    if (!email || !/^\d{6}$/.test(code)) {
      track("otp_verify_invalid_input", {
        reqId,
        hadEmail: meta.hadEmail,
        hadCode: meta.hadCode,
        codeLen: meta.codeLen,
      });
      return noStore({ error: "Invalid email or code" }, { status: 400 });
    }

    const emTh = await throttle(`verify:em:${email}`, 12, 300); // 12 per 5 min per email
    if (!emTh.allowed) {
      track("otp_verify_throttled_email", { reqId });
      return noStore({ error: "Too many attempts" }, { status: 429 });
    }

    // verify + consume
    const ok = await verifyAndConsumeOtp(email, code);
    if (!ok) {
      track("otp_verify_fail", { reqId });
      // no enumeration: keep message generic
      return noStore({ ok: false, message: "Invalid or expired code" }, { status: 400 });
    }

    // If already signed in and the session email matches, mark emailVerified
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
        track("otp_verify_mark_verified_error", { reqId });
        // If your schema doesn’t have emailVerified yet, ignore.
      }
    }

    track("otp_verify_success", { reqId, sessionEmailMatched: !!(sEmail && sEmail === email) });
    return noStore({ ok: true });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[auth/otp/verify] error", e);
    track("otp_verify_error", { reqId, message: e?.message ?? String(e) });
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
