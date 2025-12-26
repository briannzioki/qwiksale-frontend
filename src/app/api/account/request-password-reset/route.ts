// src/app/api/account/request-password-reset/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";

function jsonNoStore(body: any, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return NextResponse.json(body, { ...init, headers });
}

function siteOrigin(): string {
  const raw =
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["APP_ORIGIN"] ||
    process.env["NEXTAUTH_URL"] ||
    "https://qwiksale.sale";
  const trimmed = String(raw).trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : "https://qwiksale.sale";
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
}

function getResetSecret(): string | null {
  return (
    process.env["PASSWORD_RESET_SECRET"] ||
    process.env["NEXTAUTH_SECRET"] ||
    process.env["AUTH_SECRET"] ||
    null
  );
}

function base64urlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signResetToken(payloadJson: string, secret: string) {
  const payloadB64 = base64urlEncode(Buffer.from(payloadJson, "utf8"));
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest();
  const sigB64 = base64urlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

function safeReturnTo(v: unknown): string {
  const s = String(v ?? "/dashboard");
  return /^\/(?!\/)/.test(s) ? s : "/dashboard";
}

async function findUserByEmail(email: string) {
  const { prisma } = await import("@/app/lib/prisma");
  const anyPrisma: any = prisma as any;

  const User =
    anyPrisma?.user ??
    anyPrisma?.users ??
    anyPrisma?.User ??
    anyPrisma?.Users ??
    null;

  if (!User || typeof User.findFirst !== "function") return null;

  // Prefer findUnique if email is unique, fall back to findFirst.
  try {
    if (typeof User.findUnique === "function") {
      const u = await User.findUnique({
        where: { email },
        select: { id: true, email: true },
      });
      return u ?? null;
    }
  } catch {}

  try {
    const u = await User.findFirst({
      where: { email },
      select: { id: true, email: true },
    });
    return u ?? null;
  } catch {
    return null;
  }
}

async function sendEmailViaResend(args: { to: string; subject: string; html: string; text?: string }) {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return { ok: false as const, reason: "missing_resend_key" };

  const from =
    process.env["EMAIL_FROM"] ||
    process.env["RESEND_FROM"] ||
    "QwikSale <support@qwiksale.sale>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false as const, reason: `resend_${res.status}`, detail: t.slice(0, 500) };
  }
  return { ok: true as const };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function POST(req: NextRequest) {
  // Always respond success-ish to avoid account enumeration.
  // In QS_E2E=1, we may include resetUrl when a real user exists.
  const secret = getResetSecret();
  if (!secret) {
    return jsonNoStore(
      { error: "Server misconfigured: missing PASSWORD_RESET_SECRET or NEXTAUTH_SECRET." },
      { status: 500 },
    );
  }

  let email = "";
  let returnTo = "/dashboard";

  try {
    const body: any = await req.json().catch(() => ({}));
    email = String(body?.email || "").trim().toLowerCase();
    returnTo = safeReturnTo(body?.returnTo);
  } catch {
    // keep defaults
  }

  if (!isValidEmail(email)) {
    // Keep same outward response in prod. In dev, help the user.
    const isDev = process.env.NODE_ENV !== "production";
    return jsonNoStore(isDev ? { error: "Invalid email." } : { ok: true }, { status: isDev ? 400 : 200 });
  }

  const user = await findUserByEmail(email);

  const isE2E =
    process.env["QS_E2E"] === "1" ||
    process.env["PLAYWRIGHT"] === "1" ||
    process.env["E2E"] === "1";

  // If no user: still respond OK (avoid enumeration). In E2E, omit resetUrl so test can catch wrong seed.
  if (!user?.id) {
    return jsonNoStore({ ok: true });
  }

  // Token payload: email + exp + nonce. (Stateless, no DB table needed.)
  const expMs = Date.now() + 60 * 60 * 1000; // 60 minutes
  const nonce = base64urlEncode(crypto.randomBytes(16));
  const payload = JSON.stringify({ e: email, exp: expMs, n: nonce });

  const token = signResetToken(payload, secret);

  const origin = siteOrigin();
  const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}&return=${encodeURIComponent(
    returnTo,
  )}`;

  // Send email best-effort. If sending fails, still respond OK (don’t leak).
  try {
    const subject = "Reset your QwikSale password";
    const safeUrl = escapeHtml(resetUrl);

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height: 1.45;">
        <h2 style="margin: 0 0 12px 0;">Reset your password</h2>
        <p style="margin: 0 0 12px 0;">
          We received a request to reset your QwikSale password.
          If you didn’t request this, you can ignore this email.
        </p>
        <p style="margin: 0 0 16px 0;">
          <a href="${safeUrl}" style="display: inline-block; padding: 10px 14px; border-radius: 12px; background: #161748; color: #fff; text-decoration: none;">
            Set a new password
          </a>
        </p>
        <p style="margin: 0; color: #666; font-size: 12px;">
          This link expires in 60 minutes.
        </p>
        <p style="margin: 12px 0 0 0; color: #666; font-size: 12px;">
          Or copy and paste this link into your browser:<br/>
          <span>${safeUrl}</span>
        </p>
      </div>
    `.trim();

    const text = `Reset your QwikSale password:\n\n${resetUrl}\n\nThis link expires in 60 minutes.`;

    const sent = await sendEmailViaResend({ to: email, subject, html, text });

    // In dev, log failures for debugging.
    if (!sent.ok && process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[request-password-reset] email send failed:", sent);
      // eslint-disable-next-line no-console
      console.log("[request-password-reset] resetUrl:", resetUrl);
    }
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[request-password-reset] exception:", e);
      // eslint-disable-next-line no-console
      console.log("[request-password-reset] resetUrl:", resetUrl);
    }
  }

  // In E2E or non-prod, we can return resetUrl to unblock automated testing.
  if (isE2E || process.env.NODE_ENV !== "production") {
    return jsonNoStore({ ok: true, resetUrl });
  }

  return jsonNoStore({ ok: true });
}
