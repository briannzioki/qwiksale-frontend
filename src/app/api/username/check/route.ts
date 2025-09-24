// src/app/api/username/check/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";          // ← use shared singleton
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";

/* ------------------------------ helpers ------------------------------ */
function json(json: unknown, init?: ResponseInit) {
  return NextResponse.json(json, init);
}
function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}
function setEdgeCache(res: NextResponse, seconds = 60) {
  const v = `public, s-maxage=${seconds}, stale-while-revalidate=${seconds}`;
  res.headers.set("Cache-Control", v);
  res.headers.set("CDN-Cache-Control", v);
  res.headers.set("Vary", "Accept-Encoding");
  return res;
}
/** Only cache when there's no auth/cookies to avoid user-specific answers. */
function isAnon(req: NextRequest) {
  const authz = req.headers.get("authorization");
  const cookie = req.headers.get("cookie");
  return !authz && !(cookie && cookie.includes("session"));
}

/** 3–24; letters/digits/._; no leading/trailing sep; no double sep */
const USERNAME_RE =
  /^(?![._])(?!.*[._]$)(?!.*[._]{2})[a-zA-Z0-9._]{3,24}$/;

const RESERVED = new Set(
  [
    "admin","administrator","root","support","help","contact",
    "api","auth","login","logout","signup","register",
    "me","profile","settings","qwiksale","qwik","user"
  ].concat(
    (process.env["RESERVED_USERNAMES"] || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  )
);

type Reason = "empty" | "invalid_format" | "reserved" | "taken" | null;

/* ---------------------------------- GET ---------------------------------- */
export async function GET(req: NextRequest) {
  try {
    // Per-IP throttle (uses your shared helper)
    const rl = await checkRateLimit(req.headers, {
      name: "username_check",
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.ok) return tooMany("Too many requests. Please slow down.", rl.retryAfterSec);

    const url = new URL(req.url);
    const raw = (url.searchParams.get("u") ?? url.searchParams.get("username") ?? "").trim();

    if (!raw) {
      return noStore(json({ available: false, valid: false, normalized: "", reason: "empty" as Reason }, { status: 400 }));
    }

    // Keep original casing for display, but compare case-insensitively
    const normalized = raw;
    const lower = normalized.toLowerCase();

    if (!USERNAME_RE.test(normalized)) {
      return noStore(json({ available: false, valid: false, normalized, reason: "invalid_format" as Reason }, { status: 400 }));
    }

    if (RESERVED.has(lower)) {
      const res = json({ available: false, valid: true, normalized, reason: "reserved" as Reason }, { status: 200 });
      return isAnon(req) ? setEdgeCache(res, 120) : noStore(res);
    }

    // Who is asking? (their current username counts as available)
    const session = await auth().catch(() => null);
    const meId = (session as any)?.user?.id as string | undefined;

    const existing = await prisma.user.findFirst({
      where: { username: { equals: normalized, mode: "insensitive" } },
      select: { id: true },
    });

    const available = !existing || (!!meId && existing.id === meId);
    const reason: Reason = available ? null : "taken";

    const res = json({ available, valid: true, normalized, reason }, { status: 200 });
    return isAnon(req) ? setEdgeCache(res, 60) : noStore(res);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/username/check] error:", e);
    return noStore(json({ error: "Server error" }, { status: 500 }));
  }
}

/* ------------------------------ OPTIONS (CORS, optional) ------------------------------ */
export function OPTIONS() {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", process.env["NEXT_PUBLIC_APP_URL"] || "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
