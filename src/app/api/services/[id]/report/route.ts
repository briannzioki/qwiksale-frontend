// src/app/api/services/[id]/report/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

/* ---------------------------- utilities ---------------------------- */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
  return res;
}

function getId(req: NextRequest): string {
  try {
    const pathname = req?.nextUrl?.pathname ?? "";
    const segs = pathname.split("/");
    const i = segs.findIndex((s) => s === "services");
    const nxt = i >= 0 ? segs[i + 1] : "";
    return String(nxt ?? "").trim();
  } catch {
    return "";
  }
}

function getClientIp(req: NextRequest): string | null {
  const xf =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-vercel-forwarded-for") ||
    "";
  if (xf) return xf.split(",")[0]?.trim() || null;
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return null;
}

function s(v: unknown) {
  const t = typeof v === "string" ? v : v == null ? "" : String(v);
  const out = t.trim();
  return out.length ? out : undefined;
}
function clip(v: string | undefined, max = 4000) {
  if (!v) return v;
  return v.length <= max ? v : v.slice(0, max);
}
function isSafe(req: NextRequest) {
  return (
    req.method === "POST" &&
    (req.headers.get("content-type") || "")
      .toLowerCase()
      .includes("application/json")
  );
}

/* -------------------------- reason whitelist -------------------------- */
const REASONS = [
  "scam",
  "prohibited",
  "spam",
  "wrong_category",
  "counterfeit",
  "offensive",
  "other",
] as const;
type Reason = (typeof REASONS)[number];
const REASON_SET = new Set<Reason>(REASONS);

/* -------------------- prisma alias (type fallback) -------------------- */
const db = prisma as unknown as typeof prisma & {
  report: {
    count: (args: any) => Promise<number>;
    create: (args: any) => Promise<{ id: string }>;
  };
};

/* ------------------------------ POST ------------------------------ */
export async function POST(req: NextRequest) {
  try {
    if (!isSafe(req)) return noStore({ error: "Bad request" }, { status: 400 });

    const id = getId(req);
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const session = await auth().catch(() => null);
    const reporterId = (session?.user as any)?.id as string | undefined;

    const body = await req.json().catch(() => ({} as any));
    const reason = s(body?.reason) as Reason | undefined;
    const details = clip(s(body?.details), 4000);

    if (!reason || !REASON_SET.has(reason)) {
      return noStore({ error: "Invalid reason" }, { status: 400 });
    }

    const ip = getClientIp(req);
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Deduplicate same reporter/ip for same listing within 6h
    const recentSame = await db.report.count({
      where: {
        listingType: "service",
        listingId: id,
        createdAt: { gte: sixHoursAgo },
        OR: [
          ...(reporterId ? [{ userId: reporterId }] : []),
          ...(ip ? [{ ip }] : []),
        ],
      },
    });
    if (recentSame > 0) {
      return noStore({ ok: true, deduped: true }, { status: 200 });
    }

    // Global anti-abuse: no more than 20 reports/day per user/ip
    const recentGlobal = await db.report.count({
      where: {
        createdAt: { gte: dayAgo },
        OR: [
          ...(reporterId ? [{ userId: reporterId }] : []),
          ...(ip ? [{ ip }] : []),
        ],
      },
    });
    if (recentGlobal >= 20) {
      return noStore({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const created = await db.report.create({
      data: {
        listingId: id,
        listingType: "service",
        reason,
        details: details ?? null,
        ip,
        userId: reporterId ?? null,
      },
      select: { id: true },
    });

    return noStore(
      { ok: true, reportId: created.id },
      { status: 201 }
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[services/:id/report POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ----------------------------- CORS ----------------------------- */
export function OPTIONS() {
  const origin =
    process.env["NEXT_PUBLIC_APP_URL"] ??
    process.env["APP_ORIGIN"] ??
    "*";

  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
