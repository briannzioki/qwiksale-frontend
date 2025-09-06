// src/app/api/_lib/email.ts
import { Resend } from "resend";
import * as React from "react";

// Access env via bracket notation to satisfy TS index signature checks
const RESEND_API_KEY = process.env["RESEND_API_KEY"];
const DEFAULT_FROM = process.env["EMAIL_FROM"] ?? "QwikSale <noreply@qwiksale.sale>";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export type SendEmailOpts = {
  to: string | string[];
  subject: string;
  react?: React.ReactElement;
  html?: string;
  text?: string;
  from?: string;
};

export async function sendEmail(opts: SendEmailOpts) {
  if (!resend) return { id: null, queued: false, reason: "RESEND_API_KEY missing" };
  const from = opts.from ?? DEFAULT_FROM;

  if (opts.react) {
    const { data, error } = await resend.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      react: opts.react,
    });
    if (error) return { id: null, queued: false, reason: String(error) };
    return { id: data?.id ?? null, queued: true };
  }

  const payload = {
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  };
  const { data, error } = await resend.emails.send(payload as any);
  if (error) return { id: null, queued: false, reason: String(error) };
  return { id: data?.id ?? null, queued: true };
}

export function otpEmailHTML(code: string) {
  const safe = String(code).replace(/[^0-9]/g, "").slice(0, 6);
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif">
    <h2>Your QwikSale verification code</h2>
    <p>Use this code to verify your email:</p>
    <div style="font-size:28px;font-weight:700;letter-spacing:4px;margin:12px 0">${safe}</div>
    <p>This code expires in 10 minutes. If you didn’t request it, you can ignore this email.</p>
  </div>`;
}

export function OtpEmailReact({ code }: { code: string }): React.ReactElement {
  const safe = String(code).replace(/[^0-9]/g, "").slice(0, 6);
  return React.createElement(
    "div",
    { style: { fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif" } },
    React.createElement("h2", null, "Your QwikSale verification code"),
    React.createElement("p", null, "Use this code to verify your email:"),
    React.createElement(
      "div",
      { style: { fontSize: 28, fontWeight: 700, letterSpacing: 4, margin: "12px 0" } },
      safe
    ),
    React.createElement(
      "p",
      null,
      "This code expires in 10 minutes. If you didn’t request it, you can ignore this email."
    )
  );
}
