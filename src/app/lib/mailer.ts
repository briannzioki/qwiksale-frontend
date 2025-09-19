// src/app/lib/mailer.ts
import type { Options } from "nodemailer/lib/smtp-transport";

let provider: "resend" | "smtp" | "console" = "console";

// Lazy deps to keep edge bundles slim
let ResendMod: any = null;
let nodemailer: any = null;

const RESEND_API_KEY = process.env["RESEND_API_KEY"] || "";
const MAIL_FROM =
  process.env["MAIL_FROM"] ||
  process.env["RESEND_FROM"] ||
  process.env["SMTP_FROM"] ||
  "QwikSale <no-reply@qwiksale.sale>";

if (RESEND_API_KEY) {
  provider = "resend";
} else if (process.env["SMTP_URL"] || process.env["SMTP_HOST"]) {
  provider = "smtp";
} else {
  provider = "console";
}

export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  if (!to) throw new Error("sendMail: missing 'to'");
  if (!subject) throw new Error("sendMail: missing 'subject'");
  if (!html) throw new Error("sendMail: missing 'html'");

  if (provider === "resend") {
    if (!ResendMod) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ResendMod = require("resend");
    }
    const resend = new ResendMod.Resend(RESEND_API_KEY);
    await resend.emails.send({ from: MAIL_FROM, to, subject, html });
    return;
  }

  if (provider === "smtp") {
    if (!nodemailer) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      nodemailer = require("nodemailer");
    }
    const url = process.env["SMTP_URL"];
    const transport =
      url
        ? nodemailer.createTransport(url)
        : nodemailer.createTransport({
            host: process.env["SMTP_HOST"],
            port: Number(process.env["SMTP_PORT"] || 587),
            secure: !!process.env["SMTP_SECURE"], // "true" to force TLS
            auth: process.env["SMTP_USER"]
              ? { user: process.env["SMTP_USER"], pass: process.env["SMTP_PASS"] }
              : undefined,
          } as Options);

    await transport.sendMail({ from: MAIL_FROM, to, subject, html });
    return;
  }

  // Fallback: don’t crash in dev/preview
  // eslint-disable-next-line no-console
  console.log(`[mailer:console] to=${to} subject=${subject}\n${html}`);
}

export async function sendWeeklyDigest(args: {
  to: string;
  name?: string | null;
  weeklyCount: number; // e.g. views+saves+new listings
  since: Date;
}) {
  const { to, name, weeklyCount, since } = args;
  const subject = "Your QwikSale weekly digest";
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5">
      <h2 style="margin:0 0 12px">Hi ${name || "there"} 👋</h2>
      <p>Here’s your activity since <strong>${since.toDateString()}</strong>:</p>
      <p><strong>Total highlights:</strong> ${weeklyCount}</p>
      <p><a href="${process.env["NEXT_PUBLIC_SITE_URL"] || "https://qwiksale.sale"}/dashboard" style="color:#39a0ca">Open your dashboard →</a></p>
    </div>
  `;
  await sendMail(to, subject, html);
}
