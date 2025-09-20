export const preferredRegion = 'fra1';
// src/app/api/otp/email/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { guardRate } from "@/app/api/_lib/guard";
import { json, err, noStore } from "@/app/api/_lib/http";
import { sendEmail, otpEmailHTML } from "@/app/api/_lib/email";

// If you have a persistent OTP store (KV/DB), wire it here:
// import { setEmailOtp } from "@/app/api/_lib/otp-store";

/* ------------------------------- utils ------------------------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (!s || s.length > 254) return null;
  return EMAIL_RE.test(s) ? s : null;
}

function maskEmail(e: string): string {
  // jane.doe@example.com -> ja***@example.com
  const [user, host] = e.split("@");
  if (!user || !host) return e;
  if (user.length <= 2) return `${user[0] ?? "*"}***@${host}`;
  return `${user.slice(0, 2)}***@${host}`;
}

function sixDigit(): string {
  // 100000..999999 (left-padded not needed here)
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/* -------------------------------- POST -------------------------------- */

export async function POST(req: Request) {
  try {
    // Rate-limit by IP / key
    const limited = await guardRate(req, "post:otp:email:start");
    if (limited) return limited;

    // Parse body defensively
    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      return err(400, "invalid json");
    }

    const email = normalizeEmail((body as any)?.email);
    if (!email) return err(400, "missing or invalid email");

    // Issue code — prefer a persistent store if you have one:
    // const code = await setEmailOtp(email);
    const code = sixDigit();

    // Compose email
    const subject = "Your QwikSale code";
    const html = otpEmailHTML(code);
    const text = `Your QwikSale verification code is: ${code}\n\nThis code expires soon. If you didn’t request it, you can ignore this email.`;

    // Send (best-effort)
    const sent = await sendEmail({ to: email, subject, html, text });

    // Optionally expose the code ONLY in non-production to speed up QA
    const devEcho =
      (process.env["NODE_ENV"] !== "production") &&
      process.env["NEXT_PUBLIC_SHOW_DEV_TEST"] === "1";

    // Shape response (never leak raw email/PII more than needed)
    return noStore(
      {
        ok: true,
        queued: Boolean((sent as any)?.queued),
        id: (sent as any)?.id ?? null,
        to: maskEmail(email),
        ...(devEcho ? { devCode: code } : {}),
      },
      { status: 200 }
    );
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn("[/api/otp/email POST] error:", e);
    return err(500, "server error");
  }
}
