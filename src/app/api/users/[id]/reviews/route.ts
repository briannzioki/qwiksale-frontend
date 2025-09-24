// src/app/api/users/[id]/reviews/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";

// ----------------------- tiny helpers -----------------------
function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
function setNoStore(res: NextResponse) {
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
function isAnon(req: NextRequest) {
  const authz = req.headers.get("authorization");
  const cookie = req.headers.get("cookie");
  return !authz && !(cookie && cookie.includes("session"));
}
function getUserIdFromReq(req: NextRequest): string {
  // strip trailing slash to avoid empty last segment
  const path = req.nextUrl.pathname.replace(/\/+$/, "");
  const segs = path.split("/");
  const i = segs.findIndex((s) => s === "users");
  if (i < 0 || i + 1 >= segs.length) return "";
  const raw = segs[i + 1] ?? "";
  // decode in case the id is URL-encoded
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}
function clampText(s: unknown, max = 1500): string {
  const t = typeof s === "string" ? s : String(s ?? "");
  const trimmed = t.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}
function iso(d: unknown): string {
  return d instanceof Date ? d.toISOString() : String(d ?? "");
}

// ----------------------- types (loose) -----------------------
type ReviewRow = {
  id: string;
  rating: number;
  text: string | null;
  createdAt: Date | string;
  rater: { id: string; name: string | null; username: string | null; image: string | null };
};
// “db” alias only if your Prisma doesn’t yet have Review in its types:
const db = prisma as unknown as typeof prisma & {
  review: {
    findMany: (args: any) => Promise<ReviewRow[]>;
    aggregate: (args: any) => Promise<{ _avg: { rating: number | null }; _count: { rating: number } }>;
    create: (args: any) => Promise<{ id: string; rating: number }>;
    findFirst: (args: any) => Promise<any>;
  };
};

// ----------------------------- GET -----------------------------
export async function GET(req: NextRequest) {
  try {
    // Light per-IP throttle
    const rl = await checkRateLimit(req.headers, {
      name: "reviews_get",
      limit: 120,
      windowMs: 60_000,
    });
    if (!rl.ok) return tooMany("You’re requesting reviews too fast.", rl.retryAfterSec);

    const rateeId = getUserIdFromReq(req);
    if (!rateeId) return setNoStore(json({ error: "Missing id" }, { status: 400 }));

    const url = new URL(req.url);
    const cursorParam = url.searchParams.get("cursor");
    const cursor = (cursorParam ?? "").trim() || undefined;
    const rawSize = Number(url.searchParams.get("pageSize") ?? 10);
    const pageSize = Number.isFinite(rawSize)
      ? Math.max(1, Math.min(50, Math.trunc(rawSize)))
      : 10;

    const args: any = {
      where: { rateeId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1, // +1 to detect next page
      select: {
        id: true,
        rating: true,
        text: true,
        createdAt: true,
        rater: { select: { id: true, name: true, username: true, image: true } },
      },
    };
    if (cursor) {
      args.cursor = { id: cursor };
      args.skip = 1;
    }

    const rows: ReviewRow[] = await db.review.findMany(args);
    const hasMore = rows.length > pageSize;

    const sliced: ReviewRow[] = hasMore ? rows.slice(0, pageSize) : rows;
    const items = sliced.map((r: ReviewRow) => ({
      id: r.id,
      rating: r.rating,
      text: r.text,
      createdAt: iso(r.createdAt),
      rater: r.rater,
    }));
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

    const agg = await db.review.aggregate({
      where: { rateeId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    const payload = {
      items,
      nextCursor,
      hasMore,
      avg: agg._avg.rating ?? null,
      count: agg._count.rating ?? 0,
    };

    const res = json(payload, { status: 200 });
    return isAnon(req) ? setEdgeCache(res, 60) : setNoStore(res);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[reviews GET]", e);
    return setNoStore(json({ error: "Server error" }, { status: 500 }));
  }
}

// ----------------------------- POST -----------------------------
export async function POST(req: NextRequest) {
  try {
    const session = await auth().catch(() => null);
    const raterId = (session?.user as any)?.id as string | undefined;
    if (!raterId) return setNoStore(json({ error: "Unauthorized" }, { status: 401 }));

    const rateeId = getUserIdFromReq(req);
    if (!rateeId) return setNoStore(json({ error: "Missing id" }, { status: 400 }));
    if (rateeId === raterId) return setNoStore(json({ error: "Cannot review yourself" }, { status: 400 }));

    // Per-user rate limit for posting reviews
    const rl = await checkRateLimit(req.headers, {
      name: "reviews_post",
      limit: 8,
      windowMs: 10 * 60_000,
      extraKey: raterId,
    });
    if (!rl.ok) return tooMany("Too many reviews. Try again later.", rl.retryAfterSec);

    const body = (await req.json().catch(() => ({}))) as {
      rating?: unknown;
      text?: unknown;
      listingId?: unknown;
    };

    const ratingNum = Math.round(Number(body?.rating ?? 0));
    if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return setNoStore(json({ error: "Rating must be an integer 1–5" }, { status: 400 }));
    }

    const text = clampText(body?.text ?? "", 1500);
    if (ratingNum <= 3 && text.length < 10) {
      return setNoStore(json({ error: "Please add a short comment for ratings of 3 or below." }, { status: 400 }));
    }

    const listingId =
      typeof body?.listingId === "string" && body.listingId.trim()
        ? body.listingId.trim()
        : null;

    // Optional sanity: if listingId is provided, ensure it exists and belongs to the ratee.
    if (listingId) {
      const listing = await prisma.product
        .findUnique({ where: { id: listingId }, select: { sellerId: true } })
        .catch(() => null);
      if (listing && listing.sellerId && listing.sellerId !== rateeId) {
        return setNoStore(json({ error: "Listing does not belong to this user." }, { status: 400 }));
      }
    }

    // Prevent duplicates for same listing (if listingId provided)
    if (listingId) {
      const dup = await db.review.findFirst({
        where: { raterId, rateeId, listingId },
        select: { id: true },
      });
      if (dup) {
        return setNoStore(json({ error: "You already reviewed this listing." }, { status: 409 }));
      }
    } else {
      // Without listingId, limit one review per rater→ratee in the last 30 days
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recent = await db.review.findFirst({
        where: { raterId, rateeId, createdAt: { gte: since } },
        select: { id: true },
      });
      if (recent) {
        return setNoStore(json({ error: "You can review this user again after 30 days." }, { status: 429 }));
      }
    }

    const created = await db.review.create({
      data: { raterId, rateeId, rating: ratingNum, text, listingId },
      select: { id: true, rating: true },
    });

    return setNoStore(json({ ok: true, review: created }, { status: 201 }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[reviews POST]", e);
    return setNoStore(json({ error: "Server error" }, { status: 500 }));
  }
}
