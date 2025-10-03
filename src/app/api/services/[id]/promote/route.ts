// src/app/api/services/[id]/promote.route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

const CAPS = {
  BASIC: { featured: 0, activeListings: 10 },
  GOLD: { featured: 3, activeListings: 50 },
  PLATINUM: { featured: 10, activeListings: 200 },
} as const;

function getId(req: NextRequest): string {
  const segs = req.nextUrl.pathname.split("/");
  const i = segs.findIndex((s) => s === "services");
  const next = i >= 0 ? segs[i + 1] : "";
  return (next ?? "").toString().trim();
}

export async function POST(req: NextRequest) {
  try {
    const id = getId(req);
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const session = await auth().catch(() => null);
    const uid = (session?.user as any)?.id as string | undefined;
    if (!uid) return noStore({ error: "Unauthorized" }, { status: 401 });

    const me = await prisma.user.findUnique({
      where: { id: uid },
      select: { id: true, subscription: true, subscriptionUntil: true },
    });
    if (!me) return noStore({ error: "Unauthorized" }, { status: 401 });

    // Is owner?
    const listing = await prisma.service.findUnique({
      where: { id },
      select: { id: true, sellerId: true, status: true, featured: true },
    });
    if (!listing || listing.sellerId !== uid) {
      return noStore({ error: "Not found" }, { status: 404 });
    }

    // Determine effective tier (expires => fallback to BASIC)
    const now = Date.now();
    const activeTierExpired =
      me.subscriptionUntil && new Date(me.subscriptionUntil).getTime() < now;
    const tier =
      (activeTierExpired
        ? "BASIC"
        : (me.subscription as "BASIC" | "GOLD" | "PLATINUM")) || "BASIC";
    const caps = CAPS[tier];

    // Enforce caps
    const activeCount = await prisma.service.count({
      where: { sellerId: uid, status: "ACTIVE" },
    });
    if (activeCount > caps.activeListings) {
      return noStore({ error: `Active listings cap exceeded for ${tier}` }, { status: 403 });
    }

    const featuredCount = await prisma.service.count({
      where: { sellerId: uid, status: "ACTIVE", featured: true },
    });

    if (!listing.featured) {
      if (featuredCount >= caps.featured) {
        return noStore({ error: `Featured cap reached for ${tier}` }, { status: 403 });
      }
      await prisma.service.update({
        where: { id },
        data: { featured: true },
      });
    }

    return noStore({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[services/:id/promote POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
