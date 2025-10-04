// src/app/api/services/[id]/promote/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import type { Prisma } from "@prisma/client";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
  return res;
}

const CAPS = {
  BASIC: { featured: 0, activeListings: 10 },
  GOLD: { featured: 3, activeListings: 50 },
  PLATINUM: { featured: 10, activeListings: 200 },
} as const;

function getIdFromPath(req: NextRequest) {
  const segs = req.nextUrl.pathname.split("/");
  const i = segs.findIndex((s) => s === "services");
  const next = i >= 0 ? segs[i + 1] : "";
  return (next ?? "").toString().trim();
}

function normalizeTier(raw?: string | null): keyof typeof CAPS {
  const t = (raw || "").toUpperCase().trim();
  if (t === "GOLD" || t === "PLATINUM") return t;
  return "BASIC";
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Validator expects Promise<{id:string}> for params
    let id = "";
    try {
      const p = await context.params;
      id = (p?.id ?? "").trim();
    } catch {
      /* ignore */
    }
    if (!id) id = getIdFromPath(req);
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const session = await auth().catch(() => null);
    const uid = (session?.user as any)?.id as string | undefined;
    if (!uid) return noStore({ error: "Unauthorized" }, { status: 401 });

    const me = await prisma.user.findUnique({
      where: { id: uid },
      select: { id: true, subscription: true, subscriptionUntil: true },
    });
    if (!me) return noStore({ error: "Unauthorized" }, { status: 401 });

    // Determine effective tier (expires => fallback to BASIC)
    const now = Date.now();
    const expired =
      me.subscriptionUntil ? new Date(me.subscriptionUntil).getTime() < now : false;
    const tier = expired ? "BASIC" : normalizeTier(me.subscription as string | null);
    const caps = CAPS[tier];

    // Use a transaction to reduce race conditions around caps
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Re-read the listing inside the transaction to avoid stale reads
      const listingNow = await tx.service.findUnique({
        where: { id },
        select: { id: true, sellerId: true, status: true, featured: true },
      });

      // Ownership + existence check inside txn
      if (!listingNow || listingNow.sellerId !== uid) {
        return { ok: false as const, error: "Not found" };
      }

      // Active listings cap check
      const activeCount = await tx.service.count({
        where: { sellerId: uid, status: "ACTIVE" },
      });
      if (activeCount > caps.activeListings) {
        return { ok: false as const, error: `Active listings cap exceeded for ${tier}` };
      }

      // Featured cap enforcement
      const featuredCount = await tx.service.count({
        where: { sellerId: uid, status: "ACTIVE", featured: true },
      });

      let updated = listingNow;

      if (!listingNow.featured) {
        if (featuredCount >= caps.featured) {
          return { ok: false as const, error: `Featured cap reached for ${tier}` };
        }
        updated = await tx.service.update({
          where: { id },
          data: { featured: true },
          // include sellerId so shape matches listingNow (avoids TS mismatch)
          select: { id: true, sellerId: true, featured: true, status: true },
        });
      }

      return { ok: true as const, service: updated };
    });

    if (!result.ok) {
      const status = result.error === "Not found" ? 404 : 403;
      return noStore({ error: result.error }, { status });
    }

    return noStore({ ok: true, service: result.service });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[services/:id/promote POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

export function OPTIONS() {
  const origin =
    process.env["NEXT_PUBLIC_APP_URL"] ??
    process.env["APP_ORIGIN"] ??
    "*";
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS, HEAD");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
