// src/app/lib/mailer.ts
import type { Transporter } from "nodemailer";
import nodemailer from "nodemailer";
import { Resend } from "resend";

const FROM = process.env["EMAIL_FROM"] || "QwikSale <no-reply@qwiksale.sale>";
const REPLY_TO = process.env["EMAIL_REPLY_TO"] || "Support <support@qwiksale.sale>";
const RESEND_KEY = process.env["RESEND_API_KEY"];
const SMTP_URL = process.env["EMAIL_SERVER"];

// Prefer Resend in prod
const resend = RESEND_KEY ? new Resend(RESEND_KEY) : null;

// Fallback SMTP (Mailtrap) for local dev
let smtp: Transporter | null = null;
if (!RESEND_KEY && SMTP_URL) {
  smtp = nodemailer.createTransport(SMTP_URL);
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
) {
  if (!resend) throw new Error("Resend not configured");
  // Resend uses `reply_to`
  await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    ...(replyTo || REPLY_TO ? { reply_to: replyTo || REPLY_TO } : {}),
  } as any);
}

async function sendViaSmtp(
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
) {
  if (!smtp) throw new Error("SMTP not configured");
  await smtp.sendMail({
    from: FROM,
    to,
    subject,
    html,
    replyTo: replyTo || REPLY_TO,
  });
}

/** Primary helper used by the app */
export async function sendMail(
  to: string,
  subject: string,
  html: string,
  opts?: { replyTo?: string },
) {
  if (resend) return sendViaResend(to, subject, html, opts?.replyTo);
  if (smtp) return sendViaSmtp(to, subject, html, opts?.replyTo);

  // Last resort: avoid silent failure in dev
  // eslint-disable-next-line no-console
  console.warn(
    "[mailer] No mail transport configured. Set RESEND_API_KEY or EMAIL_SERVER.",
  );
  if (process.env.NODE_ENV !== "production") return;
  throw new Error("No mail transport configured");
}

/** Optional convenience for the cron digest */
export async function sendWeeklyDigest(args: {
  to: string;
  name?: string | null;
  weeklyCount: number;
  since: Date;
}) {
  const { to, name, weeklyCount, since } = args;
  const html = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
      <h2 style="margin:0 0 12px">Hi ${name || "there"} 👋</h2>
      <p>In the last 7 days (since ${since.toDateString()}), you had <strong>${weeklyCount}</strong> new events.</p>
      <p><a href="${process.env["NEXT_PUBLIC_APP_URL"] || "https://qwiksale.sale"}/dashboard" style="color:rgb(57 160 202)">Open your dashboard →</a></p>
    </div>
  `;
  await sendMail(to, "Your QwikSale weekly digest", html);
}
