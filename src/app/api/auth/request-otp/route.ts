// src/app/api/auth/otp/start/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { normalizeKenyanPhone } from "@/app/lib/phone";
import nodemailer from "nodemailer";

/** ---------- Email (Mailtrap / any SMTP) ---------- */
const EMAIL_FROM = process.env.EMAIL_FROM || "QwikSale <no-reply@qwiksale.local>";

function getMailer() {
  const raw = (process.env.EMAIL_SERVER || "").trim();
  if (!raw) return null;
  try {
    // Accept JSON (Mailtrap dashboard sometimes shows JSON config)
    if (raw.startsWith("{")) return nodemailer.createTransport(JSON.parse(raw));
    // Accept full SMTP/SMTPS URL
    if (/^smtps?:\/\//i.test(raw)) return nodemailer.createTransport(raw);
    // Accept "host:port" (optionally with user:pass@host:port)
    if (/^.+@.+:\d+$/.test(raw) || /^[^:]+:\d+$/.test(raw)) {
      return nodemailer.createTransport(`smtp://${raw}`);
    }
    console.warn("[email] Unrecognized EMAIL_SERVER format. Skipping mail transport.");
    return null;
  } catch (e) {
    console.warn("[email] Invalid EMAIL_SERVER. Will log links instead. Error:", e);
    return null;
  }
}
const mailer = getMailer();

/** ---------- Africa's Talking (optional) ---------- */
const AT_USERNAME = (process.env.AT_USERNAME || "").trim();
const AT_API_KEY = (process.env.AT_API_KEY || "").trim();
const AT_SENDER_ID = (process.env.AT_SENDER_ID || "").trim(); // optional, must be approved
const AT_ENV = (process.env.AT_ENV || "production").toLowerCase();
const AT_HOST =
  AT_ENV === "sandbox"
    ? "https://api.sandbox.africastalking.com"
    : "https://api.africastalking.com";

/** ---------- Helpers ---------- */
function code6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendSms(toMSISDN254: string, text: string) {
  // If no AT creds, just log (dev)
  if (!AT_USERNAME || !AT_API_KEY) {
    console.log(`[OTP][SMS][DEV] to ${toMSISDN254}: ${text}`);
    return true;
  }

  const to = toMSISDN254.startsWith("+") ? toMSISDN254 : `+${toMSISDN254}`;
  const form = new URLSearchParams({
    username: AT_USERNAME,
    to,
    message: text.slice(0, 459),
    ...(AT_SENDER_ID ? { from: AT_SENDER_ID } : {}),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000); // 10s timeout

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
      console.warn(`Africa's Talking send failed (${r.status}): ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    clearTimeout(timer);
    console.warn("[OTP][SMS] network error:", e);
    return false;
  }
}

async function sendEmail(toEmail: string, text: string) {
  if (!mailer) {
    console.log(`[OTP][EMAIL][DEV] to ${toEmail}: ${text}`);
    return true;
  }
  try {
    await mailer.sendMail({
      to: toEmail,
      from: EMAIL_FROM,
      subject: "Your QwikSale code",
      text,
    });
    return true;
  } catch (e) {
    console.warn("[OTP][EMAIL] send error:", e);
    return false;
  }
}

/** ---------- Route ---------- */
export async function POST(req: Request) {
  try {
    const { identifier } = (await req.json().catch(() => ({}))) as {
      identifier?: string;
    };

    const raw = (identifier || "").trim();
    if (!raw) {
      return NextResponse.json({ error: "Missing identifier" }, { status: 400 });
    }

    // Try phone first (Kenya); if not KE phone, treat as email
    const phone254 = normalizeKenyanPhone(raw); // "2547XXXXXXXX" or "2541XXXXXXXX" or null
    const isPhone = !!phone254;
    const email = isPhone ? "" : raw.toLowerCase();

    if (!isPhone && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Enter a valid Kenyan phone or email address" },
        { status: 400 }
      );
    }

    const idKey = isPhone ? `tel:${phone254}` : email;

    // Generate a new code and ensure we only keep the latest one
    const token = code6();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Clear any previous codes for this identifier
    await prisma.verificationToken.deleteMany({ where: { identifier: idKey } });
    await prisma.verificationToken.create({
      data: { identifier: idKey, token, expires },
    });

    const message = `Your QwikSale code is ${token}. It expires in 10 minutes.`;

    let sendOk = true;
    if (isPhone) {
      sendOk = await sendSms(phone254!, message);
      if (!sendOk) {
        // Fallback log so you can still sign in if SMS provider is down
        console.log(`[OTP][SMS][fallback] ${phone254} -> ${token}`);
      }
    } else {
      sendOk = await sendEmail(email, message);
      if (!sendOk) {
        console.log(`[OTP][EMAIL][fallback] ${email} -> ${token}`);
      }
    }

    return NextResponse.json(
      { ok: true, channel: isPhone ? "sms" : "email" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("[/api/auth/otp/start] error:", e);
    return NextResponse.json({ error: "Failed to start OTP" }, { status: 500 });
  }
}
