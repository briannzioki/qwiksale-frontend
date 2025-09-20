export const preferredRegion = ['fra1'];
// src/app/api/auth/register/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { hashPassword } from "@/server/auth";

/* ───────────────────────── helpers ───────────────────────── */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function normalizeEmail(v?: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (!s) return null;
  // very light validation; defer heavy checks to auth provider if needed
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  return ok ? s : null;
}

function getClientIp(req: NextRequest | Request): string {
  // Works on Vercel/Cloudflare/Node
  // @ts-ignore - NextRequest extends Request
  const h = (req.headers ?? new Headers()) as Headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "0.0.0.0"
  );
}

/* ───────────────────────── types ───────────────────────── */
type Body = {
  email?: string;
  password?: string;
};

/* ───────────────────────── route ───────────────────────── */
export async function POST(req: NextRequest) {
  try {
    // Content-Type guard (accept json only)
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return noStore({ error: "Expected application/json" }, { status: 415 });
    }

    // Parse & normalize
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return noStore({ error: "Invalid JSON body" }, { status: 400 });
    }

    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";

    // Validation (mirror client expectations)
    if (!email) {
      return noStore({ error: "Enter a valid email." }, { status: 400 });
    }
    if (password.length < 6) {
      return noStore(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    // Does a user already exist for this email?
    // Prefer case-insensitive match to be safe across DB collations
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: {
        id: true,
        passwordHash: true,
        accounts: { select: { provider: true }, take: 1 },
      },
    });

    if (existing) {
      // If account exists but without password (OAuth-only), prompt correct flow
      if (!existing.passwordHash) {
        return noStore(
          {
            error:
              "This email is linked to a social login. Use “Continue with Google”, or reset your password from that method first.",
            code: "OAuthAccountNotLinked",
          },
          { status: 409 }
        );
      }
      return noStore(
        { error: "Account already exists. Please sign in." },
        { status: 409 }
      );
    }

    // Create user (hash server-side)
    const passwordHash = await hashPassword(password);

    const created = await prisma.user.create({
      data: {
        email,
        passwordHash,
        // You can set sensible defaults here if your schema supports them:
        // emailVerified: null,
        // subscription: "FREE",
      },
      select: { id: true, email: true },
    });

    // Minimal telemetry (console only; swap for your analytics later)
    // eslint-disable-next-line no-console
    console.log("[api/auth/register] created", {
      userId: created.id,
      email,
      ip: getClientIp(req),
      ts: new Date().toISOString(),
    });

    return noStore({ ok: true, user: created }, { status: 201 });
  } catch (err: any) {
    // Prisma unique guard (if race condition hits)
    if (err?.code === "P2002") {
      return noStore(
        { error: "Account already exists. Please sign in." },
        { status: 409 }
      );
    }
    // eslint-disable-next-line no-console
    console.error("[api/auth/register] error:", err);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

export async function GET() {
  // health check
  return noStore({ ok: true, method: "GET" }, { status: 200 });
}

export async function OPTIONS() {
  return noStore({ ok: true }, { status: 200 });
}
