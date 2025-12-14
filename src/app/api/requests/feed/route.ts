// src/app/api/requests/feed/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function isBoosted(boostUntil?: string | Date | null) {
  if (!boostUntil) return false;
  const t = new Date(boostUntil as any).getTime();
  return Number.isFinite(t) && t > Date.now();
}

function createdMs(v?: string | Date | null) {
  if (!v) return 0;
  const t = new Date(v as any).getTime();
  return Number.isFinite(t) ? t : 0;
}

async function getPreferredCategory(meId: string): Promise<string | null> {
  try {
    const [p, s] = await Promise.all([
      prisma.product.findFirst({
        where: { sellerId: meId },
        orderBy: { createdAt: "desc" },
        select: { category: true, createdAt: true },
      }),
      prisma.service.findFirst({
        where: { sellerId: meId },
        orderBy: { createdAt: "desc" },
        select: { category: true, createdAt: true },
      }),
    ]);

    const pTime = p?.createdAt ? p.createdAt.getTime() : 0;
    const sTime = s?.createdAt ? s.createdAt.getTime() : 0;

    if (pTime === 0 && sTime === 0) return null;
    if (pTime >= sTime) return (p?.category || "").trim() || null;
    return (s?.category || "").trim() || null;
  } catch {
    return null;
  }
}

function safeSelect() {
  return {
    id: true,
    kind: true,
    title: true,
    description: true,
    location: true,
    category: true,
    tags: true,
    createdAt: true,
    expiresAt: true,
    status: true,
    boostUntil: true,
  };
}

/**
 * GET /api/requests/feed
 * Safe feed for header drawer
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    const meId = (session as any)?.user?.id as string | undefined;

    const now = new Date();
    const requestModel = (prisma as any).request;

    // IMPORTANT: do NOT filter `status` with hard-coded enum values.
    // Your enum drifted (RequestStatus), and Prisma will throw.
    const raw =
      (await requestModel?.findMany?.({
        where: {
          expiresAt: { gt: now },
        },
        select: safeSelect(),
        orderBy: [{ createdAt: "desc" }],
        take: 50,
      })) ?? [];

    const preferredCategory = meId ? await getPreferredCategory(meId) : null;

    const items = (Array.isArray(raw) ? raw : []).map((r: any) => ({
      ...r,
      createdAt: r?.createdAt ? new Date(r.createdAt).toISOString() : null,
      expiresAt: r?.expiresAt ? new Date(r.expiresAt).toISOString() : null,
      boostUntil: r?.boostUntil ? new Date(r.boostUntil).toISOString() : null,
    }));

    items.sort((a: any, b: any) => {
      const ab = isBoosted(a.boostUntil) ? 1 : 0;
      const bb = isBoosted(b.boostUntil) ? 1 : 0;
      if (ab !== bb) return bb - ab; // boosted first

      if (preferredCategory) {
        const ap =
          String(a?.category || "").toLowerCase() ===
          preferredCategory.toLowerCase()
            ? 1
            : 0;
        const bp =
          String(b?.category || "").toLowerCase() ===
          preferredCategory.toLowerCase()
            ? 1
            : 0;
        if (ap !== bp) return bp - ap; // preferred category first (signed-in only)
      }

      return createdMs(b.createdAt) - createdMs(a.createdAt); // newest
    });

    return noStore({ ok: true, items: items.slice(0, 30) });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/requests/feed GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
