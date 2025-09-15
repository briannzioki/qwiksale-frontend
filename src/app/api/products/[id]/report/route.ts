// src/app/api/products/[id]/report/route.ts
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
  return res;
}

function getId(req: NextRequest): string {
  try {
    const pathname = req?.nextUrl?.pathname ?? "";
    const segs = pathname.split("/");
    const i = segs.findIndex((s) => s === "products");
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
/** TS-safe alias so builds pass even if @prisma/client isn't regenerated yet. */
const db = prisma as unknown as typeof prisma & {
  report: {
    count: (args: any) => Promise<number>;
    create: (args: any) => Promise<{ id: string }>;
  };
};

/* ------------------------------ POST ------------------------------ */
/** POST { reason, details? } — auth optional */
export async function POST(req: NextRequest) {
  try {
    if (!isSafe(req)) return noStore({ error: "Bad request" }, { status: 400 });

    const productId = getId(req);
    if (!productId) return noStore({ error: "Missing id" }, { status: 400 });

    const session = await auth().catch(() => null);
    const reporterId = (session?.user as any)?.id as string | undefined;

    const body = await req.json().catch(() => ({}));
    const reason = s(body?.reason) as Reason | undefined;
    const details = clip(s(body?.details), 4000);

    if (!reason || !REASON_SET.has(reason)) {
      return noStore({ error: "Invalid reason" }, { status: 400 });
    }

    // Soft rate limit (per-listing + global)
    const ip = getClientIp(req);
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // No duplicate reports on same listing within 6h for same user or IP
    const recentSame = await db.report.count({
      where: {
        listingType: "product",
        listingId: productId,
        createdAt: { gte: sixHoursAgo },
        OR: [
          ...(reporterId ? [{ userId: reporterId }] : []),
          ...(ip ? [{ ip }] : []),
        ],
      },
    });
    if (recentSame > 0) {
      return noStore({ ok: true, deduped: true });
    }

    // Global cap: <= 20 reports / 24h per user/IP
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
        listingId: productId,
        listingType: "product",
        reason, // Prisma enum (ReportReason)
        details: details ?? null,
        ip,
        userId: reporterId ?? null,
      },
      select: { id: true },
    });

    return noStore({ ok: true, reportId: created.id }, { status: 201 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[products/:id/report POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ----------------------------- CORS (optional) ----------------------------- */
export function OPTIONS() {
  const origin =
    process.env["NEXT_PUBLIC_SITE_URL"] ??
    process.env["NEXT_PUBLIC_APP_URL"] ??
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
