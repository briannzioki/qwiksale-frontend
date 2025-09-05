// src/app/api/auth/otp/start/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { saveOtp, throttle } from "../_store";
import { Resend } from "resend";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = "QwikSale <noreply@qwiksale.sale>";

async function extractEmail(req: Request): Promise<string | null> {
  const url = new URL(req.url);
  const qp = url.searchParams.get("email") ?? url.searchParams.get("e") ?? url.searchParams.get("mail");
  if (qp && EMAIL_RE.test(qp)) return qp.trim().toLowerCase();

  try {
    const j = await req.clone().json().catch(() => null) as any;
    const cands = [j?.email, j?.Email, j?.mail, j?.user?.email, j?.data?.email];
    const pick = cands?.find((v: unknown) => typeof v === "string" && EMAIL_RE.test(v));
    if (pick) return (pick as string).trim().toLowerCase();
  } catch {}

  try {
    const raw = await req.text();
    const trimmed = raw.trim().replace(/^"+|"+$/g, "");
    if (EMAIL_RE.test(trimmed)) return trimmed.toLowerCase();
    const m = raw.match(/email\s*[:=]\s*"?([^"\s]+)"?/i);
    if (m?.[1] && EMAIL_RE.test(m[1])) return m[1].toLowerCase();
  } catch {}

  try {
    const session = await auth();
    const sEmail = (session as any)?.user?.email as string | undefined;
    if (sEmail && EMAIL_RE.test(sEmail)) return sEmail.toLowerCase();
  } catch {}

  return null;
}

function randCode(): string {
  // 6-digit, no leading zeros issue
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendEmail(email: string, code: string) {
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif">
      <h2>Your QwikSale verification code</h2>
      <p>Use this code to verify your email:</p>
      <div style="font-size:28px;font-weight:700;letter-spacing:4px;margin:12px 0">${code}</div>
      <p>This code expires in 10 minutes. If you didn’t request it, you can ignore this email.</p>
    </div>
  `;
  if (RESEND) {
    await RESEND.emails.send({ from: FROM, to: email, subject: "Your QwikSale code", html });
  } else {
    // Dev fallback
    console.log(`[DEV OTP] ${email} -> ${code}`);
  }
}

async function handle(req: Request) {
  const email = await extractEmail(req);
  if (!email) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  // Basic throttles: per IP and per email
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0] || "ip:unknown";
  const ipTh = await throttle(`start:ip:${ip}`, 10, 60);        // 10 requests/min/IP
  const emTh = await throttle(`start:em:${email}`, 5, 300);     // 5 requests/5min/email
  if (!ipTh.allowed || !emTh.allowed) {
    return NextResponse.json({ error: "Too many requests, try again later." }, { status: 429 });
  }

  const code = randCode();
  await saveOtp(email, code, OTP_TTL_MS);
  await sendEmail(email, code);

  return NextResponse.json(
    {
      ok: true,
      channel: "email",
      // Don’t leak existence; always generic:
      message: "If this email exists, a verification code has been sent.",
    },
    { status: 202, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
