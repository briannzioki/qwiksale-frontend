// src/app/api/auth/request-otp/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { normalizeKenyanPhone } from "@/app/lib/phone";
import nodemailer from "nodemailer";

/** ---------- constants ---------- */
const BRAND = "QwikSale";
const EMAIL_FROM = process.env.EMAIL_FROM || `${BRAND} <no-reply@qwiksale.sale>`;

/** ---------- response helper (no-store everywhere) ---------- */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

/** ---------- Email (SMTP) ---------- */
function getMailer() {
  const raw = (process.env.EMAIL_SERVER || "").trim();
  if (!raw) return null;
  try {
    if (raw.startsWith("{")) return nodemailer.createTransport(JSON.parse(raw)); // JSON
    if (/^smtps?:\/\//i.test(raw)) return nodemailer.createTransport(raw);       // URL
    if (/^.+@.+:\d+$/.test(raw) || /^[^:]+:\d+$/.test(raw))                      // user:pass@host:port or host:port
      return nodemailer.createTransport(`smtp://${raw}`);
    console.warn("[OTP][EMAIL] Unrecognized EMAIL_SERVER format. Skipping transport.");
    return null;
  } catch (e) {
    console.warn("[OTP][EMAIL] Invalid EMAIL_SERVER. Will log instead. Error:", e);
    return null;
  }
}
const mailer = getMailer();

/** ---------- Africa's Talking (optional) ---------- */
const AT_USERNAME = (process.env.AT_USERNAME || "").trim();
const AT_API_KEY = (process.env.AT_API_KEY || "").trim();
const AT_SENDER_ID = (process.env.AT_SENDER_ID || "").trim(); // optional
const AT_ENV = (process.env.AT_ENV || "production").toLowerCase();
const AT_HOST =
  AT_ENV === "sandbox"
    ? "https://api.sandbox.africastalking.com"
    : "https://api.africastalking.com";

/** ---------- helpers ---------- */
function code6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function getClientIp(req: NextRequest) {
  // Useful for logs/rate clues (Cloudflare/Vercel pass these)
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

async function sendSms(msisdn254: string, text: string) {
  if (!AT_USERNAME || !AT_API_KEY) {
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
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.warn(`[OTP][SMS] send failed (${r.status}): ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    clearTimeout(timer);
    console.warn("[OTP][SMS] network error:", e);
    return false;
  }
}

async function sendEmail(to: string, text: string) {
  if (!mailer) {
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
    console.warn("[OTP][EMAIL] send error:", e);
    return false;
  }
}

/** ---------- route ---------- */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return noStore({ error: "Invalid JSON body." }, { status: 400 });
    }
    if (typeof body !== "object" || body === null) {
      return noStore({ error: "Body must be a JSON object." }, { status: 400 });
    }

    const { identifier }: { identifier?: unknown } = body as any;
    const raw = typeof identifier === "string" ? identifier.trim() : "";

    if (!raw) {
      return noStore({ error: "Missing identifier" }, { status: 400 });
    }

    // Phone (Kenya) or email
    const phone254 = normalizeKenyanPhone(raw); // "2547XXXXXXXX" | "2541XXXXXXXX" | null
    const isPhone = !!phone254;
    const email = isPhone ? "" : raw.toLowerCase();

    if (!isPhone && !isValidEmail(email)) {
      return noStore(
        { error: "Enter a valid Kenyan phone or email" },
        { status: 400 }
      );
    }

    const idKey = isPhone ? `tel:${phone254}` : email;

    // One valid code per identifier (clear old)
    await prisma.verificationToken.deleteMany({ where: { identifier: idKey } });

    // Create new code (10 min)
    const token = code6();
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.verificationToken.create({
      data: { identifier: idKey, token, expires },
    });

    const message = `Your ${BRAND} code is ${token}. It expires in 10 minutes.`;

    // Send via chosen channel (best-effort; avoid user enumeration)
    let sent = true;
    if (isPhone) {
      sent = await sendSms(phone254!, message);
      if (!sent) console.log(`[OTP][SMS][fallback] ${phone254} -> ${token}`);
    } else {
      sent = await sendEmail(email, message);
      if (!sent) console.log(`[OTP][EMAIL][fallback] ${email} -> ${token}`);
    }

    // Always respond success (no enumeration); attach channel for client UX
    return noStore(
      { ok: true, channel: isPhone ? "sms" : "email" },
      // reinforce no-store even though helper adds it
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[/api/auth/request-otp] error:", e);
    return noStore({ error: "Failed to request OTP" }, { status: 500 });
  }
}
