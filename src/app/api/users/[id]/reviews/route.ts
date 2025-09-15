export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

/* ------------------------------------------------------------------ */
/* TS-safe alias until prisma generate runs with Review model          */
/* ------------------------------------------------------------------ */
const db = prisma as unknown as typeof prisma & {
  review: {
    findMany: (args: any) => Promise<any[]>;
    aggregate: (args: any) => Promise<any>;
    create: (args: any) => Promise<any>;
  };
};

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

function getUserIdFromReq(req: NextRequest): string {
  const segs = req.nextUrl.pathname.split("/");
  const i = segs.findIndex((s) => s === "users");
  const id = i >= 0 ? segs[i + 1] : "";
  return (id ?? "").toString().trim();
}

/* ------------------------------------------------------------------ */
/* GET reviews for a seller                                            */
/* ------------------------------------------------------------------ */
export async function GET(req: NextRequest) {
  try {
    const id = getUserIdFromReq(req);
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const reviews = await db.review.findMany({
      where: { rateeId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        rating: true,
        text: true,
        createdAt: true,
        rater: { select: { id: true, name: true, username: true, image: true } },
      },
    });

    const avg = await db.review.aggregate({
      where: { rateeId: id },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return noStore({ items: reviews, avg: avg._avg.rating, count: avg._count.rating });
  } catch (e) {
    console.warn("[reviews GET]", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/* POST new review                                                     */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  try {
    const session = await auth().catch(() => null);
    const raterId = (session?.user as any)?.id as string | undefined;
    if (!raterId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const rateeId = getUserIdFromReq(req);
    if (!rateeId) return noStore({ error: "Missing id" }, { status: 400 });
    if (rateeId === raterId) return noStore({ error: "Cannot review yourself" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const rating = Number(body.rating || 0);
    const text = (body.text || "").toString().trim();
    const listingId = (body.listingId || "").toString().trim() || null;

    if (rating < 1 || rating > 5) {
      return noStore({ error: "Rating must be 1-5" }, { status: 400 });
    }

    // TODO: purchase-guard (ensure buyer actually bought/listed)

    const review = await db.review.create({
      data: { raterId, rateeId, rating, text, listingId },
      select: { id: true, rating: true },
    });

    return noStore({ ok: true, review }, { status: 201 });
  } catch (e) {
    console.warn("[reviews POST]", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
