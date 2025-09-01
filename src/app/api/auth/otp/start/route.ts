// src/app/api/auth/otp/start/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { saveOtp } from "../_store";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function extractEmail(req: Request): Promise<string | null> {
  const url = new URL(req.url);

  const qp =
    url.searchParams.get("email") ??
    url.searchParams.get("e") ??
    url.searchParams.get("mail");
  if (qp && EMAIL_RE.test(qp)) return qp.trim().toLowerCase();

  try {
    const j = (await req.clone().json()) as any;
    const cands = [j?.email, j?.Email, j?.mail, j?.user?.email, j?.data?.email];
    const pick = cands.find((v: unknown) => typeof v === "string" && EMAIL_RE.test(v));
    if (pick) return (pick as string).trim().toLowerCase();
  } catch {
    /* not JSON */
  }

  try {
    const raw = await req.text();
    const trimmed = raw.trim().replace(/^"+|"+$/g, "");
    if (EMAIL_RE.test(trimmed)) return trimmed.toLowerCase();
    const m = raw.match(/email\s*[:=]\s*"?([^"\s]+)"?/i);
    if (m?.[1] && EMAIL_RE.test(m[1])) return m[1].toLowerCase();
  } catch {
    /* ignore */
  }

  try {
    const session = await auth();
    const sEmail = (session as any)?.user?.email as string | undefined;
    if (sEmail && EMAIL_RE.test(sEmail)) return sEmail.toLowerCase();
  } catch {
    /* ignore */
  }

  return null;
}

function randCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function handle(req: Request) {
  const email = await extractEmail(req);
  if (!email) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const code = randCode();
  saveOtp(email, code, 10 * 60 * 1000); // 10 minutes

  // DEV: "send" by logging
  console.log(`[OTP] Email verification code for ${email}: ${code}`);

  return NextResponse.json(
    {
      ok: true,
      channel: "email",
      message:
        "If this email exists, a verification code has been sent. (DEV: check server logs)",
    },
    { status: 202, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
