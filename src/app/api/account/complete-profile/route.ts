// src/app/api/account/complete-profile/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";
import { revalidateTag } from "next/cache";

/* -------------------- helpers -------------------- */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Consistent username rule (no leading/trailing dot/underscore, no repeats)
const USERNAME_RE = /^(?![._])(?!.*[._]$)(?!.*[._]{2})[a-zA-Z0-9._]{3,24}$/;

function isValidEmail(email: string) {
  return EMAIL_RE.test(email);
}
function looksLikeValidUsername(u: string) {
  return USERNAME_RE.test(u);
}

// Built-ins + extend via env (comma-separated)
const RESERVED = new Set(
  [
    "admin","administrator","root","support","help","contact","api","auth",
    "login","logout","signup","register","me","profile","settings",
    "qwiksale","qwik","user"
  ].concat(
    (process.env["RESERVED_USERNAMES"] || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  )
);

/* -------------------- CORS (optional) -------------------- */
export function OPTIONS() {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", process.env["NEXT_PUBLIC_APP_URL"] || "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/* -------------------- route -------------------- */
export async function POST(req: NextRequest) {
  // Require auth
  const session = await auth().catch(() => null);
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

  // Rate limit (per IP + user)
  const rl = await checkRateLimit(req.headers, {
    name: "complete_profile",
    limit: 12,
    windowMs: 10 * 60_000,
    extraKey: userId,
  });
  if (!rl.ok) return tooMany("Too many attempts. Please slow down.", rl.retryAfterSec);

  // Content-Type + tiny body-size guard
  const ctype = (req.headers.get("content-type") || "").toLowerCase();
  if (!ctype.includes("application/json")) {
    return noStore({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  const clen = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(clen) && clen > 32_000) {
    return noStore({ error: "Payload too large" }, { status: 413 });
  }

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

  // Validate shapes (present-but-empty or wrong type)
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
        { error: "Username must be 3–24 chars (letters, numbers, dot, underscore), no leading/trailing symbol, no repeats." },
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
    select: { id: true, email: true, username: true, emailVerified: true, name: true },
  });
  if (!me) return noStore({ error: "Not found" }, { status: 404 });

  const nextUsername = wantUsername ?? me.username ?? null;
  const nextEmail = wantEmail ?? (me.email ? me.email.toLowerCase() : null);

  // No-op?
  if (
    (nextUsername ?? null) === (me.username ?? null) &&
    (nextEmail ?? null) === (me.email ? me.email.toLowerCase() : null)
  ) {
    return noStore({ ok: true, user: me, noChange: true, profileComplete: true });
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
    if (typeof me.emailVerified !== "undefined") {
      // If your schema tracks verification, clear on change
      if ((me.email ?? "").toLowerCase() !== wantEmail) data.emailVerified = null;
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

    // Best-effort revalidate any profile-tagged data
    try {
      revalidateTag(`user:${me.id}:profile`);
    } catch {}

    // (Optional) trigger email verification here if email changed

    return noStore({ ok: true, user, profileComplete: true });
  } catch (e: any) {
    if (e?.code === "P2002") {
      // Unique constraint fallback
      return noStore({ error: "Already in use" }, { status: 409 });
    }
    // eslint-disable-next-line no-console
    console.error("[complete-profile POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
