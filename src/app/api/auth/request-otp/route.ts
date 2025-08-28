// src/app/api/auth/request-otp/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { normalizeKenyanPhone } from "@/app/lib/phone";
import nodemailer from "nodemailer";

const smtpUrl = process.env.EMAIL_SERVER;
const mailer = smtpUrl ? nodemailer.createTransport(smtpUrl) : null;
const emailFrom = process.env.EMAIL_FROM || "no-reply@qwiksale.local";

function code6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: Request) {
  try {
    const { identifier } = await req.json();
    if (!identifier) {
      return NextResponse.json({ error: "Missing identifier" }, { status: 400 });
    }

    const phone = normalizeKenyanPhone(identifier);
    const idKey = phone ? `tel:${phone}` : String(identifier).toLowerCase();
    const token = code6();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.verificationToken.create({
      data: { identifier: idKey, token, expires },
    });

    if (phone) {
      // TODO: integrate SMS (Africa'sTalking/Twilio). For now, log to server:
      console.log(`[OTP][SMS] to ${phone}: ${token}`);
    } else if (mailer) {
      await mailer.sendMail({
        to: idKey,
        from: emailFrom,
        subject: "Your QwikSale code",
        text: `Your one-time code is ${token}. It expires in 10 minutes.`,
      });
    } else {
      console.log(`[OTP][EMAIL] to ${idKey}: ${token}`);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[request-otp] error", e);
    return NextResponse.json({ error: "Failed to send code" }, { status: 500 });
  }
}
