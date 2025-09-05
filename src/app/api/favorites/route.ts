// src/app/api/favorites/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { track } from "@/app/lib/analytics";

/* ------------------------------- utils ------------------------------- */
function noStore(jsonOrRes: unknown, init?: ResponseInit): NextResponse {
  const res =
    jsonOrRes instanceof NextResponse
      ? jsonOrRes
      : NextResponse.json(jsonOrRes as any, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (id) return id ?? null;

  const email = session?.user?.email || null;
  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  return user?.id ?? null;
}

/** Local wrapper to avoid EventName union friction while we roll out events. */
function trackSafe(event: string, props: Record<string, unknown> = {}): void {
  // cast to any so we don't have to edit the global EventName union right now
  (track as any)(event, props);
}

/** Extracts a productId from query or JSON body (never throws). */
async function getProductIdFromReq(req: Request): Promise<string> {
  // 1) Query param
  const url = new URL(req.url);
  const qp = url.searchParams.get("productId") ?? url.searchParams.get("id");
  if (qp && qp.trim()) return qp.trim();

  // 2) JSON body
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    /* ignore non-JSON */
  }
  const pid =
    typeof (body as any)?.productId === "string"
      ? (body as any).productId.trim()
      : "";
  return pid;
}

/**
 * GET /api/favorites
 *   ?format=ids|full (default ids)
 *   &includeInactive=0|1 (default 0)
 *   &limit=number (default 50, max 200)
 *   &cursor=isoTimestamp (paginate by createdAt)
 */
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const format = (url.searchParams.get("format") || "ids").toLowerCase();
    const includeInactive = (url.searchParams.get("includeInactive") || "0").trim() === "1";

    const limitRaw = Number(url.searchParams.get("limit") || "50");
    const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50), 200);

    const cursorStr = url.searchParams.get("cursor") || "";
    const cursor = cursorStr ? new Date(cursorStr) : null;
    const cursorValid = !!cursor && !Number.isNaN(cursor.getTime());

    const whereBase: {
      userId: string;
      createdAt?: { lt: Date };
    } = { userId };
    if (cursorValid && cursor) whereBase.createdAt = { lt: cursor };

    if (format === "full") {
      const favorites = await prisma.favorite.findMany({
        where: includeInactive
          ? whereBase
          : { ...whereBase, product: { status: "ACTIVE" as const } },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              brand: true,
              category: true,
              subcategory: true,
              condition: true,
              price: true,
              image: true,
              createdAt: true,
              featured: true,
              location: true,
              status: true,
              seller: {
                select: { id: true, username: true, name: true, image: true },
              },
            },
          },
        },
      });

      const nextCursor =
        favorites.length > 0
          ? favorites[favorites.length - 1].createdAt.toISOString()
          : null;

      // analytics (read event)
      trackSafe("favorites_listed", {
        userId,
        format: "full",
        count: favorites.length,
        includeInactive,
      });

      return noStore({ items: favorites, nextCursor });
    }

    // ids (fast path)
    const rows: Array<{ productId: string; createdAt: Date }> =
      await prisma.favorite.findMany({
        where: includeInactive
          ? whereBase
          : { ...whereBase, product: { status: "ACTIVE" as const } },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { productId: true, createdAt: true },
      });

    const ids = rows.map((r: { productId: string; createdAt: Date }) => r.productId);
    const nextCursor =
      rows.length > 0 ? rows[rows.length - 1].createdAt.toISOString() : null;

    // analytics (read event)
    trackSafe("favorites_listed", {
      userId,
      format: "ids",
      count: ids.length,
      includeInactive,
    });

    return noStore({ items: ids, nextCursor });
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error("GET /api/favorites error:", e);
    const msg = e instanceof Error ? e.message : "Server error";
    return noStore({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const pid = await getProductIdFromReq(req);
    if (!pid) return noStore({ error: "productId is required" }, { status: 400 });

    const exists = await prisma.product.findUnique({
      where: { id: pid },
      select: { id: true },
    });
    if (!exists) return noStore({ error: "Invalid productId" }, { status: 400 });

    await prisma.favorite.upsert({
      where: { userId_productId: { userId, productId: pid } },
      update: {},
      create: { userId, productId: pid },
    });

    // analytics
    trackSafe("favorite_added", { userId, productId: pid });

    return noStore({ ok: true, added: true, productId: pid });
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error("POST /api/favorites error:", e);
    const msg = e instanceof Error ? e.message : "Server error";
    return noStore({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await requireUserId();
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const pid = await getProductIdFromReq(req);
    if (!pid) return noStore({ error: "productId is required" }, { status: 400 });

    // Idempotent delete
    await prisma.favorite
      .delete({ where: { userId_productId: { userId, productId: pid } } })
      .catch(() => null);

    // analytics
    trackSafe("favorite_removed", { userId, productId: pid });

    return noStore({ ok: true, removed: true, productId: pid });
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error("DELETE /api/favorites error:", e);
    const msg = e instanceof Error ? e.message : "Server error";
    return noStore({ error: msg }, { status: 500 });
  }
}

export async function HEAD() {
  return noStore(new NextResponse(null, { status: 204 }));
}

export async function OPTIONS() {
  return noStore({ ok: true }, { status: 200 });
}
