// src/app/api/account/reset-password/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";

function jsonNoStore(body: any, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return NextResponse.json(body, { ...init, headers });
}

function getResetSecret(): string | null {
  return (
    process.env["PASSWORD_RESET_SECRET"] ||
    process.env["NEXTAUTH_SECRET"] ||
    process.env["AUTH_SECRET"] ||
    null
  );
}

function base64urlDecodeToBuffer(s: string) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Buffer.from(b64, "base64");
}

function base64urlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function timingSafeEqualB64Url(aB64Url: string, bB64Url: string) {
  const a = base64urlDecodeToBuffer(aB64Url);
  const b = base64urlDecodeToBuffer(bB64Url);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function verifyAndDecodeToken(token: string, secret: string): { email: string; exp: number } | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;

  const payloadB64 = parts[0];
  const sigB64 = parts[1];
  if (!payloadB64 || !sigB64) return null;

  // Verify signature of payloadB64
  const expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest();
  const expectedSigB64 = base64urlEncode(expectedSig);

  if (!timingSafeEqualB64Url(sigB64, expectedSigB64)) return null;

  // Decode payload
  let payload: any = null;
  try {
    const payloadJson = base64urlDecodeToBuffer(payloadB64).toString("utf8");
    payload = JSON.parse(payloadJson);
  } catch {
    return null;
  }

  const email = String(payload?.e || "").trim().toLowerCase();
  const exp = Number(payload?.exp || 0);

  if (!email || !Number.isFinite(exp)) return null;
  if (Date.now() > exp) return null;

  return { email, exp };
}

async function hashPassword(password: string): Promise<string> {
  // Prefer bcryptjs if present (most NextAuth credentials setups use bcrypt format hashes).
  try {
    const bcrypt: any = await import("bcryptjs");
    const rounds = Number(process.env["BCRYPT_ROUNDS"] ?? 12);
    return await bcrypt.hash(password, Number.isFinite(rounds) ? rounds : 12);
  } catch {
    // Fallback: scrypt (works, but your sign-in verifier must support it to log in later).
    const salt = crypto.randomBytes(16);
    const key = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(password, salt, 32, (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey as Buffer);
      });
    });
    return `scrypt$${base64urlEncode(salt)}$${base64urlEncode(key)}`;
  }
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

async function updateUserPassword(userId: string, email: string, hashed: string) {
  const { prisma } = await import("@/app/lib/prisma");
  const anyPrisma: any = prisma as any;

  const User =
    anyPrisma?.user ??
    anyPrisma?.users ??
    anyPrisma?.User ??
    anyPrisma?.Users ??
    null;

  if (!User || typeof User.update !== "function") {
    throw new Error("User model not available.");
  }

  // Try common password field names (schema varies by project).
  const fields = ["passwordHash", "hashedPassword", "password", "password_digest"];

  // Prefer update by id if possible.
  for (const f of fields) {
    try {
      await User.update({
        where: { id: userId },
        data: { [f]: hashed },
      });
      return;
    } catch {}
  }

  // Fallback to update by email.
  for (const f of fields) {
    try {
      await User.update({
        where: { email },
        data: { [f]: hashed },
      });
      return;
    } catch {}
  }

  throw new Error(
    "Could not update password. Ensure your User model has a password hash field (passwordHash/hashedPassword/password).",
  );
}

export async function POST(req: NextRequest) {
  const secret = getResetSecret();
  if (!secret) {
    return jsonNoStore(
      { error: "Server misconfigured: missing PASSWORD_RESET_SECRET or NEXTAUTH_SECRET." },
      { status: 500 },
    );
  }

  let token = "";
  let password = "";

  try {
    const body: any = await req.json().catch(() => ({}));
    token = String(body?.token || "").trim();
    password = String(body?.password || "");
  } catch {}

  if (!token) return jsonNoStore({ error: "Missing reset token." }, { status: 400 });
  if (!password || password.length < 6) {
    return jsonNoStore({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const decoded = verifyAndDecodeToken(token, secret);
  if (!decoded?.email) return jsonNoStore({ error: "Invalid or expired token." }, { status: 400 });

  const user = await findUserByEmail(decoded.email);
  if (!user?.id) {
    // Don’t reveal whether account exists
    return jsonNoStore({ error: "Invalid or expired token." }, { status: 400 });
  }

  try {
    const hashed = await hashPassword(password);
    await updateUserPassword(String(user.id), decoded.email, hashed);
    return jsonNoStore({ ok: true });
  } catch (e: any) {
    return jsonNoStore({ error: e?.message || "Could not reset password." }, { status: 500 });
  }
}
