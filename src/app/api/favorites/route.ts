// src/app/api/favorites/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { track } from "@/app/lib/analytics";

/* ------------------------------- utils ------------------------------- */
function noStore(jsonOrRes: unknown, init?: ResponseInit): NextResponse {
  const res =
    jsonOrRes instanceof NextResponse
      ? jsonOrRes
      : NextResponse.json(jsonOrRes as any, init);

  // Never cache — user-specific
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  // Vary on auth-related headers so CDNs won’t mix users
  res.headers.set("Vary", "Cookie, Authorization");
  return res;
}

async function requireUserId(): Promise<string | null> {
  const session = await auth().catch(() => null);
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
  try {
    (track as any)(event, props);
  } catch {
    // best-effort analytics; never throw
  }
}

/** Extract a productId from query (?productId|id) or JSON body (best-effort). */
async function getProductIdFromReq(req: NextRequest): Promise<string> {
  const url = new URL(req.url);

  // Query param (productId or id)
  const qp = (url.searchParams.get("productId") ?? url.searchParams.get("id"))?.trim();
  if (qp) return qp;

  // Optional JSON body
  let body: unknown = null;
  try {
    // Only bother reading body for mutating verbs (avoid consuming streams elsewhere)
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
      body = await req.json();
    }
  } catch {
    /* ignore non-JSON */
  }

  const pid =
    typeof (body as any)?.productId === "string"
      ? (body as any).productId.trim()
      : "";
  return pid;
}

function parseBool(v: string | null, def = false): boolean {
  if (v == null) return def;
  const t = v.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(t)) return true;
  if (["0", "false", "no", "off"].includes(t)) return false;
  return def;
}

/**
 * GET /api/favorites
 *   ?format=ids|full (default ids)
 *   &includeInactive=0|1 (default 0)
 *   &limit=number (default 50, max 200)
 *   &cursor=isoTimestamp (paginate by createdAt)
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const formatRaw = (url.searchParams.get("format") || "ids").toLowerCase();
    const format: "ids" | "full" = formatRaw === "full" ? "full" : "ids";
    const includeInactive = parseBool(url.searchParams.get("includeInactive"), false);

    const limitRaw = Number(url.searchParams.get("limit") || "50");
    const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50), 200);

    const cursorStr = (url.searchParams.get("cursor") || "").trim();
    const cursorDate = cursorStr ? new Date(cursorStr) : null;
    const cursorValid = !!cursorDate && !Number.isNaN(cursorDate.getTime());

    const whereBase: { userId: string; createdAt?: { lt: Date } } = { userId };
    if (cursorValid && cursorDate) whereBase.createdAt = { lt: cursorDate };

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

      const last = favorites.length ? favorites[favorites.length - 1] : undefined;
      const nextCursor = last?.createdAt ? last.createdAt.toISOString() : null;

      trackSafe("favorites_listed", {
        userId,
        format: "full",
        count: favorites.length,
        includeInactive,
      });

      return noStore({ items: favorites, nextCursor });
    }

    // ids (fast path)
    const rows: Array<{ productId: string; createdAt: Date }> = await prisma.favorite.findMany({
      where: includeInactive
        ? whereBase
        : { ...whereBase, product: { status: "ACTIVE" as const } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { productId: true, createdAt: true },
    });

    const ids = rows.map((r) => r.productId);
    const lastRow = rows.length ? rows[rows.length - 1] : undefined;
    const nextCursor = lastRow?.createdAt ? lastRow.createdAt.toISOString() : null;

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

export async function POST(req: NextRequest) {
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

    trackSafe("favorite_added", { userId, productId: pid });

    return noStore({ ok: true, added: true, productId: pid }, { status: 201 });
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error("POST /api/favorites error:", e);
    const msg = e instanceof Error ? e.message : "Server error";
    return noStore({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const pid = await getProductIdFromReq(req);
    if (!pid) return noStore({ error: "productId is required" }, { status: 400 });

    await prisma.favorite
      .delete({ where: { userId_productId: { userId, productId: pid } } })
      .catch(() => null); // idempotent

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
  // Explicit 204 with no body; still set no-store headers
  return noStore(new NextResponse(null, { status: 204 }));
}

export async function OPTIONS() {
  const res = new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "GET, POST, DELETE, HEAD, OPTIONS",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
    },
  });
  return noStore(res);
}


