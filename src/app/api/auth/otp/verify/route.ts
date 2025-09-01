// src/app/api/auth/otp/verify/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { verifyOtp } from "../_store";
import { prisma } from "@/app/lib/prisma";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function readParams(req: Request) {
  const url = new URL(req.url);
  let email =
    url.searchParams.get("email") ??
    url.searchParams.get("e") ??
    url.searchParams.get("mail") ??
    null;
  const ct = (req.headers.get("content-type") || "").toLowerCase();

  let code: string | null =
    url.searchParams.get("code") ?? url.searchParams.get("otp") ?? null;

  try {
    if (ct.includes("application/json")) {
      const j = (await req.clone().json()) as any;
      const eCand = [j?.email, j?.Email, j?.mail, j?.user?.email, j?.data?.email].find(
        (v: unknown) => typeof v === "string"
      );
      if (eCand) email = String(eCand);
      if (j?.code ?? j?.otp) code = String(j.code ?? j.otp);
    } else {
      const raw = await req.text();
      if (!code) {
        const m = raw.match(/(?:code|otp)\s*[:=]\s*"?([0-9]{4,8})"?/i);
        if (m?.[1]) code = m[1];
      }
      if (!email) {
        const m2 = raw.match(/email\s*[:=]\s*"?([^\s"']+)"?/i);
        if (m2?.[1]) email = m2[1];
      }
    }
  } catch {
    /* ignore parse issues */
  }

  email = email?.trim().toLowerCase() ?? null;
  code = code?.trim() ?? null;

  return { email, code };
}

export async function POST(req: Request) {
  const { email, code } = await readParams(req);

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!code || !/^\d{4,8}$/.test(code)) {
    return NextResponse.json({ error: "Valid code required" }, { status: 400 });
  }

  const res = verifyOtp(email, code);
  if (res !== "ok") {
    const status = res === "expired" ? 410 : 400;
    return NextResponse.json({ ok: false, status: res }, { status });
  }

  // Best-effort mark as verified in DB (if your schema has emailVerified)
  try {
    await prisma.user.updateMany({
      where: { email },
      data: { emailVerified: new Date() },
    });
  } catch (e) {
    // ignore if the column doesn't exist; optional verification
  }

  return NextResponse.json({ ok: true, verified: true, email }, { status: 200 });
}

export async function GET(req: Request) {
  // Convenience GET: /api/auth/otp/verify?email=..&code=123456
  return POST(req);
}
