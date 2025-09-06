// src/app/api/auth/request-otp/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { normalizeKenyanPhone } from "@/app/lib/phone";
import nodemailer from "nodemailer";

/* ────────────────────────────── constants ────────────────────────────── */
const BRAND = "QwikSale";
const EMAIL_FROM =
  process.env["EMAIL_FROM"] || `${BRAND} <no-reply@qwiksale.sale>`;

// Optional: throttle how often a NEW code can be generated per identifier.
const TOKEN_TTL_MINUTES = 10;

/* ────────────────────────────── helpers ────────────────────────────── */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (!s || s.length > 254) return null;
  return EMAIL_RE.test(s) ? s : null;
}

function maskEmail(e: string): string {
  const [u, h] = e.split("@");
  if (!u || !h) return e;
  if (u.length <= 2) return `${u[0] ?? "*"}***@${h}`;
  return `${u.slice(0, 2)}***@${h}`;
}

function maskPhone254(msisdn: string): string {
  // 2547XXXXXXXX -> 2547***XX123 (keeps last 3 visible)
  const s = msisdn.replace(/\D/g, "");
  if (!/^254[17]\d{8}$/.test(s)) return msisdn;
  return `${s.slice(0, 4)}***${s.slice(-3)}`;
}

function code6(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/* ────────────────────────────── Email (SMTP) ────────────────────────────── */
function getMailer() {
  const raw = (process.env["EMAIL_SERVER"] || "").trim();
  if (!raw) return null;
  try {
    // JSON config
    if (raw.startsWith("{")) return nodemailer.createTransport(JSON.parse(raw));
    // URL config (smtp:// / smtps://)
    if (/^smtps?:\/\//i.test(raw)) return nodemailer.createTransport(raw);
    // host:port OR user:pass@host:port
    if (/^.+@.+:\d+$/.test(raw) || /^[^:]+:\d+$/.test(raw)) {
      return nodemailer.createTransport(`smtp://${raw}`);
    }
    // Unknown shape — skip
    // eslint-disable-next-line no-console
    console.warn("[OTP][EMAIL] Unrecognized EMAIL_SERVER format. Skipping transport.");
    return null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[OTP][EMAIL] Invalid EMAIL_SERVER. Will log instead. Error:", e);
    return null;
  }
}
const mailer = getMailer();

async function sendEmail(to: string, text: string) {
  if (!mailer) {
    // Dev fallback
    // eslint-disable-next-line no-console
    console.log(`[OTP][EMAIL][DEV] to ${to}: ${text}`);
    return true;
  }
  try {
    await mailer.sendMail({
      to,
      from: EMAIL_FROM,
      subject: `Your ${BRAND} code`,
      text,
    });
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[OTP][EMAIL] send error:", e);
    return false;
  }
}

/* ─────────────────────────── Africa's Talking SMS ─────────────────────────── */
const AT_USERNAME = (process.env["AT_USERNAME"] || "").trim();
const AT_API_KEY = (process.env["AT_API_KEY"] || "").trim();
// support both AS_SENDER_ID and AT_SENDER_ID env names
const AT_SENDER_ID =
  (process.env["AS_SENDER_ID"] || process.env["AT_SENDER_ID"] || "").trim();
const AT_ENV = (process.env["AT_ENV"] || "production").toLowerCase();
const AT_HOST =
  AT_ENV === "sandbox"
    ? "https://api.sandbox.africastalking.com"
    : "https://api.africastalking.com";

async function sendSms(msisdn254: string, text: string) {
  if (!AT_USERNAME || !AT_API_KEY) {
    // Dev fallback
    // eslint-disable-next-line no-console
    console.log(`[OTP][SMS][DEV] to ${msisdn254}: ${text}`);
    return true;
  }
  const to = msisdn254.startsWith("+") ? msisdn254 : `+${msisdn254}`;
  const form = new URLSearchParams({
    username: AT_USERNAME,
    to,
    message: text.slice(0, 459),
    ...(AT_SENDER_ID ? { from: AT_SENDER_ID } : {}),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const r = await fetch(`${AT_HOST}/version1/messaging`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        apiKey: AT_API_KEY,
      },
      body: form.toString(),
      // satisfy strict RequestInit: AbortSignal | null
      signal: (controller.signal ?? null) as AbortSignal | null,
    });
    clearTimeout(timer);
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.warn(`[OTP][SMS] send failed (${r.status}): ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    clearTimeout(timer);
    // eslint-disable-next-line no-console
    console.warn("[OTP][SMS] network error:", e);
    return false;
  }
}

/* ───────────────────────────────── route ───────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") || "unknown";

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return noStore({ error: "Invalid JSON body." }, { status: 400 });
    }
    if (typeof body !== "object" || body === null) {
      return noStore({ error: "Body must be a JSON object." }, { status: 400 });
    }

    // Body: { identifier: string } where identifier is Kenyan phone or email
    const { identifier }: { identifier?: unknown } = body as any;
    const raw = typeof identifier === "string" ? identifier.trim() : "";

    if (!raw) {
      return noStore({ error: "Missing identifier" }, { status: 400 });
    }

    // Decide channel: Kenya phone vs email
    const phone254 = normalizeKenyanPhone(raw); // "2547XXXXXXXX" | "2541XXXXXXXX" | null
    const isPhone = !!phone254;
    const email = isPhone ? null : normalizeEmail(raw);

    if (!isPhone && !email) {
      return noStore(
        { error: "Enter a valid Kenyan phone or email" },
        { status: 400 }
      );
    }

    // Token storage key (prevents cross-channel confusion)
    const identifierKey = isPhone ? `tel:${phone254}` : (`${email}` as string);

    // Simpler path: remove old -> create fresh (avoids enumeration).
    await prisma.verificationToken.deleteMany({ where: { identifier: identifierKey } });

    const token = code6();
    const expires = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

    await prisma.verificationToken.create({
      data: {
        identifier: identifierKey,
        token,
        expires,
        // Optional: ip/userAgent fields if present in your schema
      },
    });

    const message = `Your ${BRAND} code is ${token}. It expires in ${TOKEN_TTL_MINUTES} minutes.`;

    // Send (best-effort). Never reveal success/failure to avoid enumeration.
    let sent = true;
    if (isPhone) {
      sent = await sendSms(phone254!, message);
      if (!sent) {
        // eslint-disable-next-line no-console
        console.log(`[OTP][SMS][fallback] ${phone254} -> ${token}`);
      }
    } else {
      sent = await sendEmail(email!, message);
      if (!sent) {
        // eslint-disable-next-line no-console
        console.log(`[OTP][EMAIL][fallback] ${email} -> ${token}`);
      }
    }

    // Optional dev echo (super handy locally). Requires explicit env toggle.
    const devEcho =
      process.env["NODE_ENV"] !== "production" &&
      process.env["NEXT_PUBLIC_SHOW_DEV_TEST"] === "1";

    // Mask target for UX copy like “We’ve sent a code to …”
    const masked =
      isPhone && phone254 ? maskPhone254(phone254) : email ? maskEmail(email) : "—";

    // Log minimal telemetry
    // eslint-disable-next-line no-console
    console.log("[/api/auth/request-otp] issued", {
      channel: isPhone ? "sms" : "email",
      to: masked,
      ip,
      ua: ua.slice(0, 140),
      sent,
    });

    // Always respond success; client handles input of code next
    return noStore({
      ok: true,
      channel: isPhone ? "sms" : "email",
      to: masked,
      ttlSeconds: TOKEN_TTL_MINUTES * 60,
      ...(devEcho ? { devCode: token } : {}),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[/api/auth/request-otp] error:", e);
    return noStore({ error: "Failed to request OTP" }, { status: 500 });
  }
}

// Optional safety: refuse GET/others
export async function GET() {
  return noStore({ error: "Method not allowed" }, { status: 405 });
}
