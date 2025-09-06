// src/app/api/auth/otp/start/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { Resend } from "resend";

/* ----------------------------- constants ----------------------------- */

const BRAND = "QwikSale";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

// bracket-notation for env reads (TS4111-safe)
const FROM = process.env["EMAIL_FROM"] || `${BRAND} <noreply@qwiksale.sale>`;

// Only create Resend client if a key is present
const resend: Resend | null = process.env["RESEND_API_KEY"]
  ? new Resend(process.env["RESEND_API_KEY"] as string)
  : null;

/* -------------------- lazy OTP store (avoids TS export errors) -------------------- */

type ThrottleFn = (
  key: string,
  max: number,
  windowSec: number
) => Promise<{ allowed: boolean; remaining: number }>;
type SaveOtpFn = (email: string, code: string, ttlMs: number) => Promise<void>;

// Fallbacks (dev-friendly)
const fallbackThrottle: ThrottleFn = async (_k, max) => ({
  allowed: true,
  remaining: max,
});
const fallbackSaveOtp: SaveOtpFn = async (_e, _c, _t) => {
  /* dev no-op */
};

async function loadOtpFns(): Promise<{ throttle: ThrottleFn; saveOtp: SaveOtpFn }> {
  try {
    const mod: any = await import("../_store");
    const thr: ThrottleFn = typeof mod?.throttle === "function" ? mod.throttle : fallbackThrottle;
    const save: SaveOtpFn = typeof mod?.saveOtp === "function" ? mod.saveOtp : fallbackSaveOtp;
    return { throttle: thr, saveOtp: save };
  } catch {
    return { throttle: fallbackThrottle, saveOtp: fallbackSaveOtp };
  }
}

/* ----------------------------- tiny helpers ----------------------------- */

type AnalyticsEvent =
  | "otp_start_attempt"
  | "otp_start_invalid_email"
  | "otp_start_throttled_ip"
  | "otp_start_throttled_email"
  | "otp_start_saved"
  | "otp_start_email_sent"
  | "otp_start_email_send_error"
  | "otp_start_error";

function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  try {
    // eslint-disable-next-line no-console
    console.log(`[track] ${event}`, { ts: new Date().toISOString(), ...props });
  } catch {
    /* no-op */
  }
}

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function clientIp(req: Request) {
  const xf = (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim();
  return (
    xf ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "ip:unknown"
  );
}

function randCode(): string {
  // 6-digit, avoids leading-zero trimming issues
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendEmail(email: string, code: string): Promise<boolean> {
  const subject = `Your ${BRAND} code`;
  const text = `Use this code to verify your email: ${code}\n\nThis code expires in 10 minutes. If you didn’t request it, you can ignore this email.`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif;line-height:1.45">
      <h2 style="margin:0 0 8px">${subject}</h2>
      <p style="margin:0 0 8px">Use this code to verify your email:</p>
      <div style="font-size:28px;font-weight:800;letter-spacing:4px;margin:12px 0">${code}</div>
      <p style="margin:0 0 8px;color:#555">This code expires in 10 minutes. If you didn’t request it, you can ignore this email.</p>
    </div>
  `;

  if (!resend) {
    // Dev fallback
    // eslint-disable-next-line no-console
    console.log(`[DEV OTP EMAIL] to=${email} code=${code}`);
    return true;
  }

  try {
    await resend.emails.send({ from: FROM, to: email, subject, text, html });
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/auth/otp/start] Resend send error:", e);
    return false;
  }
}

/**
 * Accepts email in multiple shapes:
 *  - Query:  ?email=...
 *  - JSON:   { "email": "..." } or nested (user.email / data.email)
 *  - Raw:    plain text body containing the email (fallback)
 *  - Session: uses current session email if present and valid (last resort)
 */
async function extractEmail(req: Request): Promise<string | null> {
  const url = new URL(req.url);
  const qp =
    url.searchParams.get("email") ||
    url.searchParams.get("e") ||
    url.searchParams.get("mail");
  if (qp && EMAIL_RE.test(qp)) return qp.trim().toLowerCase();

  // Try JSON body
  let body: unknown = null;
  try {
    body = await req.clone().json();
  } catch {
    /* ignore */
  }
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const cands = [
      b["email"],
      (b as any)?.Email,
      (b as any)?.mail,
      (b as any)?.user?.email,
      (b as any)?.data?.email,
    ];
    const pick = cands.find((v) => typeof v === "string" && EMAIL_RE.test(v));
    if (pick) return (pick as string).trim().toLowerCase();
  }

  // Try raw text (e.g., fetch with text/plain)
  try {
    const raw = await req.text();
    const trimmed = raw.trim().replace(/^"+|"+$/g, "");
    if (EMAIL_RE.test(trimmed)) return trimmed.toLowerCase();
    const m = raw.match(/email\s*[:=]\s*"?([^"\s]+)"?/i);
    if (m?.[1] && EMAIL_RE.test(m[1])) return m[1].toLowerCase();
  } catch {
    /* ignore */
  }

  // Last resort: current session email
  try {
    const session = await auth();
    const sEmail = (session as any)?.user?.email as string | undefined;
    if (sEmail && EMAIL_RE.test(sEmail)) return sEmail.toLowerCase();
  } catch {
    /* ignore */
  }

  return null;
}

/* ----------------------------- handler ----------------------------- */

async function handle(req: Request) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    track("otp_start_attempt", { reqId, method: req.method });

    const email = await extractEmail(req);
    if (!email) {
      track("otp_start_invalid_email", { reqId });
      return noStore({ error: "Valid email required" }, { status: 400 });
    }

    // Load store functions (or safe fallbacks)
    const { throttle, saveOtp } = await loadOtpFns();

    // Throttle by IP and email to avoid abuse
    const ip = clientIp(req);
    const ipTh = await throttle(`start:ip:${ip}`, 10, 60); // 10/min/IP
    if (!ipTh.allowed) {
      track("otp_start_throttled_ip", { reqId });
      return noStore(
        { error: "Too many requests, try again later." },
        { status: 429 }
      );
    }
    const emTh = await throttle(`start:em:${email}`, 5, 300); // 5 per 5 min per email
    if (!emTh.allowed) {
      track("otp_start_throttled_email", { reqId });
      return noStore(
        { error: "Too many requests, try again later." },
        { status: 429 }
      );
    }

    const code = randCode();
    await saveOtp(email, code, OTP_TTL_MS);
    track("otp_start_saved", { reqId });

    const sent = await sendEmail(email, code);
    if (!sent) {
      track("otp_start_email_send_error", { reqId });
      // Still respond 202 to avoid user enumeration.
    } else {
      track("otp_start_email_sent", { reqId });
    }

    return noStore(
      {
        ok: true,
        channel: "email",
        expiresInSec: Math.round(OTP_TTL_MS / 1000),
        // Always generic; never reveal if the email exists
        message: "If this email exists, a verification code has been sent.",
      },
      { status: 202 }
    );
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[/api/auth/otp/start] error:", e);
    track("otp_start_error", { reqId, message: e?.message ?? String(e) });
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ----------------------------- routes ----------------------------- */

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
export async function OPTIONS() {
  // Friendly to preflight/CORS; nothing sensitive here.
  return noStore({ ok: true });
}
