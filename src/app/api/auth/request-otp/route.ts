// src/app/api/auth/request-otp/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { normalizeKenyanPhone } from "@/app/lib/phone";
import nodemailer from "nodemailer";

/** ---------- Email (SMTP) ---------- */
const EMAIL_FROM = process.env.EMAIL_FROM || "QwikSale <no-reply@qwiksale.sale>";

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

/** ---------- Helpers ---------- */
function code6() {
  return String(Math.floor(100000 + Math.random() * 900000));
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

    // Phone (Kenya) or email
    const phone254 = normalizeKenyanPhone(raw); // returns "2547XXXXXXXX" / "2541XXXXXXXX" or null
    const isPhone = !!phone254;
    const email = isPhone ? "" : raw.toLowerCase();

    if (!isPhone && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid Kenyan phone or email" }, { status: 400 });
    }

    const idKey = isPhone ? `tel:${phone254}` : email;

    // One valid code per identifier (clear old)
    await prisma.verificationToken.deleteMany({ where: { identifier: idKey } });

    const token = code6();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await prisma.verificationToken.create({
      data: { identifier: idKey, token, expires },
    });

    const message = `Your QwikSale code is ${token}. It expires in 10 minutes.`;

    let sent = true;
    if (isPhone) {
      sent = await sendSms(phone254!, message);
      if (!sent) console.log(`[OTP][SMS][fallback] ${phone254} -> ${token}`);
    } else {
      sent = await sendEmail(email, message);
      if (!sent) console.log(`[OTP][EMAIL][fallback] ${email} -> ${token}`);
    }

    return NextResponse.json(
      { ok: true, channel: isPhone ? "sms" : "email" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[/api/auth/request-otp] error:", e);
    return NextResponse.json({ error: "Failed to request OTP" }, { status: 500 });
  }
}
