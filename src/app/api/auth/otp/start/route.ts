export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import nodemailer from "nodemailer";

function getMailer() {
  const raw = (process.env.EMAIL_SERVER || "").trim();
  if (!raw) return null;
  try {
    if (raw.startsWith("{")) return nodemailer.createTransport(JSON.parse(raw));
    if (/^smtps?:\/\//i.test(raw)) return nodemailer.createTransport(raw);
    if (/^.+@.+:\d+$/.test(raw)) return nodemailer.createTransport(`smtp://${raw}`);
    console.warn("[email] Unrecognized EMAIL_SERVER format. Skipping mail transport.");
    return null;
  } catch (e) {
    console.warn("[email] Invalid EMAIL_SERVER. Will log codes instead. Error:", e);
    return null;
  }
}

const emailFrom = process.env.EMAIL_FROM || "QwikSale <no-reply@qwiksale.sale>";

function normalizeKenyanPhone(raw: string): string | null {
  let s = (raw || "").trim().replace(/\D+/g, "");
  if (!s) return null;
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^\+254(7|1)\d{8}$/.test(s)) s = s.replace(/^\+/, "");
  if (/^254(7|1)\d{8}$/.test(s)) return s;
  return null;
}

function code6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: Request) {
  try {
    const { identifier } = (await req.json().catch(() => ({}))) as { identifier?: string };
    if (!identifier) {
      return NextResponse.json({ error: "Missing identifier" }, { status: 400 });
    }

    const phone = normalizeKenyanPhone(identifier);
    const idKey = phone ? `tel:${phone}` : String(identifier).trim().toLowerCase();
    const token = code6();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.verificationToken.create({
      data: { identifier: idKey, token, expires },
    });

    if (phone) {
      console.log(`[OTP][SMS] to ${phone}: ${token}`);
    } else {
      const mailer = getMailer();
      if (mailer) {
        await mailer.sendMail({
          to: idKey,
          from: emailFrom,
          subject: "Your QwikSale code",
          text: `Your one-time code is ${token}. It expires in 10 minutes.`,
        });
      } else {
        console.log(`[OTP][EMAIL] to ${idKey}: ${token}`);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[request-otp] error", e);
    return NextResponse.json({ error: "Failed to send code" }, { status: 500 });
  }
}
