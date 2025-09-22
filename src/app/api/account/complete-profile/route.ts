// src/app/api/account/complete-profile/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

/* -------------------- helpers -------------------- */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9._]{3,24}$/;

function isValidEmail(email: string) {
  return EMAIL_RE.test(email);
}
function looksLikeValidUsername(u: string) {
  return USERNAME_RE.test(u);
}

const RESERVED = new Set(
  (process.env["RESERVED_USERNAMES"] || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

/* -------------------- route -------------------- */
export async function POST(req: Request) {
  // Require auth
  const session = await auth();
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStore({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return noStore({ error: "Body must be a JSON object." }, { status: 400 });
  }

  const { username, email } = body as { username?: unknown; email?: unknown };

  // Normalize inputs
  const wantUsername =
    typeof username === "string" && username.trim() ? username.trim() : undefined;
  const wantEmail =
    typeof email === "string" && email.trim() ? email.trim().toLowerCase() : undefined;

  // Validate shapes (reject present-but-empty or wrong type)
  if (username !== undefined && wantUsername === undefined) {
    return noStore({ error: "username must be a non-empty string." }, { status: 400 });
  }
  if (email !== undefined && wantEmail === undefined) {
    return noStore({ error: "email must be a non-empty string." }, { status: 400 });
  }

  if (!wantUsername && !wantEmail) {
    return noStore({ error: "Nothing to update." }, { status: 400 });
  }

  if (wantUsername) {
    if (!looksLikeValidUsername(wantUsername)) {
      return noStore(
        { error: "Username must be 3–24 chars: letters, numbers, dot, underscore." },
        { status: 400 }
      );
    }
    if (RESERVED.has(wantUsername.toLowerCase())) {
      return noStore({ error: "That username is reserved." }, { status: 409 });
    }
  }

  if (wantEmail && !isValidEmail(wantEmail)) {
    return noStore({ error: "Invalid email address." }, { status: 400 });
  }

  // Load current to detect no-op and for conflict checks
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true, emailVerified: true },
  });
  if (!me) return noStore({ error: "Not found" }, { status: 404 });

  const nextUsername = wantUsername ?? me.username ?? null;
  const nextEmail = wantEmail ?? me.email ?? null;

  // No-op?
  if (nextUsername === (me.username ?? null) && nextEmail === (me.email ?? null)) {
    return noStore({ ok: true, user: me, noChange: true });
  }

  // Case-insensitive uniqueness checks (exclude self)
  if (wantUsername && wantUsername.toLowerCase() !== (me.username ?? "").toLowerCase()) {
    const clash = await prisma.user.findFirst({
      where: {
        username: { equals: wantUsername, mode: "insensitive" },
        NOT: { id: me.id },
      },
      select: { id: true },
    });
    if (clash) return noStore({ error: "Username already taken" }, { status: 409 });
  }

  if (wantEmail && wantEmail !== (me.email ?? "").toLowerCase()) {
    const clash = await prisma.user.findFirst({
      where: {
        email: { equals: wantEmail, mode: "insensitive" },
        NOT: { id: me.id },
      },
      select: { id: true },
    });
    if (clash) return noStore({ error: "Email already in use" }, { status: 409 });
  }

  // Build update payload
  const data: any = {};
  if (wantUsername) data.username = wantUsername;
  if (wantEmail) {
    data.email = wantEmail;
    // If your schema includes emailVerified, clear it on email change
    if (typeof me.emailVerified !== "undefined") {
      data.emailVerified = null;
    }
  }

  // Update
  try {
    const user = await prisma.user.update({
      where: { id: me.id },
      data,
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        ...(typeof me.emailVerified !== "undefined" ? { emailVerified: true } : {}),
      },
    });

    // (Optional) You might kick off a new verification email here.

    return noStore({ ok: true, user });
  } catch (e: any) {
    // Unique constraint fallback (just in case)
    if (e?.code === "P2002") {
      return noStore({ error: "Already in use" }, { status: 409 });
    }
    // eslint-disable-next-line no-console
    console.error("[complete-profile] POST error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}


