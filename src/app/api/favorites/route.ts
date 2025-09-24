// src/app/api/favorites/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { track } from "@/app/lib/analytics";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";

/* ------------------------------- config ------------------------------- */
const MAX_FAVORITES_PER_USER = Number(process.env["NEXT_PUBLIC_MAX_FAVORITES"] ?? 5_000);

/* ------------------------------- utils ------------------------------- */
function noStore(jsonOrRes: unknown, init?: ResponseInit): NextResponse {
  const res =
    jsonOrRes instanceof NextResponse
      ? jsonOrRes
      : NextResponse.json(jsonOrRes as any, init);

  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Vary", "Cookie, Authorization, Accept-Encoding");
  return res;
}

function getIP(h: Headers): string {
  const xf = h.get("x-forwarded-for") || h.get("x-vercel-forwarded-for") || "";
  return (xf.split(",")[0]?.trim() || h.get("x-real-ip") || "0.0.0.0");
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
    /* no-op */
  }
}

/** Extract a productId from query (?productId|id) or JSON body (best-effort). */
async function getProductIdFromReq(req: NextRequest): Promise<string> {
  const url = new URL(req.url);

  const qp = (url.searchParams.get("productId") ?? url.searchParams.get("id"))?.trim();
  if (qp) return qp;

  try {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const body = await req.json();
      const pid = typeof (body as any)?.productId === "string" ? (body as any).productId.trim() : "";
      return pid;
    }
  } catch {
    /* ignore */
  }
  return "";
}

function parseBool(v: string | null, def = false): boolean {
  if (v == null) return def;
  const t = v.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(t)) return true;
  if (["0", "false", "no", "off"].includes(t)) return false;
  return def;
}

/* -------------------------- cursor helpers -------------------------- */
/** Encode { createdAtISO, productId } → base64 cursor */
function makeCursor(d: Date, productId: string): string {
  const payload = JSON.stringify({ t: d.toISOString(), id: productId });
  return Buffer.from(payload, "utf8").toString("base64url");
}
function readCursor(raw?: string | null): { t: Date; id: string } | null {
  if (!raw) return null;
  try {
    const s = Buffer.from(raw, "base64url").toString("utf8");
    const obj = JSON.parse(s) as { t?: string; id?: string };
    if (!obj?.t || !obj?.id) return null;
    const d = new Date(obj.t);
    if (Number.isNaN(d.getTime())) return null;
    return { t: d, id: String(obj.id) };
  } catch {
    return null;
  }
}

/* --------------------------------- GET --------------------------------- */
/**
 * GET /api/favorites
 *   Optional checks:
 *     - ?productId=xyz  → { exists: boolean }
 *   Listing:
 *     - ?format=ids|full (default: ids)
 *     - ?includeInactive=0|1 (default: 0)
 *     - ?limit=number (default: 50, max 200)
 *     - ?cursor=base64({t,id})
 */
export async function GET(req: NextRequest) {
  try {
    // Per-IP throttle (reads can be chatty)
    const rl = await checkRateLimit(req.headers, {
      name: "favorites_get",
      limit: 180,
      windowMs: 60_000,
      extraKey: getIP(req.headers),
    });
    if (!rl.ok) return tooMany("You’re requesting too fast.", rl.retryAfterSec);

    const userId = await requireUserId();
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const productCheck = (url.searchParams.get("productId") || "").trim();
    if (productCheck) {
      const exists = !!(await prisma.favorite.findUnique({
        where: { userId_productId: { userId, productId: productCheck } },
        select: { productId: true },
      }));
      return noStore({ exists });
    }

    const formatRaw = (url.searchParams.get("format") || "ids").toLowerCase();
    const format: "ids" | "full" = formatRaw === "full" ? "full" : "ids";
    const includeInactive = parseBool(url.searchParams.get("includeInactive"), false);

    const limitRaw = Number(url.searchParams.get("limit") || "50");
    const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50), 200);

    const cursor = readCursor(url.searchParams.get("cursor"));

    const baseWhere: any = { userId };
    if (!includeInactive) {
      // Join constraint via relational filter
      baseWhere.product = { status: "ACTIVE" as const };
    }

    // Stable order: createdAt DESC, productId DESC
    const orderBy = [{ createdAt: "desc" as const }, { productId: "desc" as const }];

    // If cursor provided: createdAt < t OR (createdAt = t AND productId < id)
    if (cursor) {
      baseWhere.OR = [
        { createdAt: { lt: cursor.t } },
        { createdAt: cursor.t, productId: { lt: cursor.id } },
      ];
    }

    if (format === "full") {
      const rows = await prisma.favorite.findMany({
        where: baseWhere,
        orderBy,
        take: limit + 1,
        select: {
          createdAt: true,
          productId: true,
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
              seller: { select: { id: true, username: true, name: true, image: true } },
            },
          },
        },
      });

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const last = items[items.length - 1];
      const nextCursor = last ? makeCursor(last.createdAt, last.productId) : null;

      trackSafe("favorites_listed", { userId, format: "full", count: items.length, includeInactive });
      return noStore({ items, nextCursor, hasMore });
    }

    // Fast path: just ids
    const rows = await prisma.favorite.findMany({
      where: baseWhere,
      orderBy,
      take: limit + 1,
      select: { productId: true, createdAt: true },
    });

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(
    (r: { productId: string }) => r.productId
      );
    const last = hasMore ? rows[limit - 1] : rows[rows.length - 1];
    const nextCursor = last ? makeCursor(last.createdAt, last.productId) : null;

    trackSafe("favorites_listed", { userId, format: "ids", count: items.length, includeInactive });
    return noStore({ items, nextCursor, hasMore });
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error("GET /api/favorites error:", e);
    const msg = e instanceof Error ? e.message : "Server error";
    return noStore({ error: msg }, { status: 500 });
  }
}

/* --------------------------------- POST --------------------------------- */
/**
 * POST /api/favorites  (JSON or query)
 * Body/Query: { productId: string }
 * - Prevent favoriting own product
 * - Enforce per-user cap
 * - Idempotent via upsert
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    // Rate limit user+IP
    const rl = await checkRateLimit(req.headers, {
      name: "favorite_add",
      limit: 20,
      windowMs: 60_000,
      extraKey: `${userId}:${getIP(req.headers)}`,
    });
    if (!rl.ok) return tooMany("Too many requests.", rl.retryAfterSec);

    const productId = await getProductIdFromReq(req);
    if (!productId) return noStore({ error: "productId is required" }, { status: 400 });

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, sellerId: true },
    });
    if (!product) return noStore({ error: "Product not found" }, { status: 404 });
    if (product.sellerId === userId) {
      return noStore({ error: "You cannot favorite your own listing" }, { status: 400 });
    }

    // Cap
    const count = await prisma.favorite.count({ where: { userId } });
    if (count >= MAX_FAVORITES_PER_USER) {
      return noStore({ error: "Favorites limit reached" }, { status: 403 });
    }

    await prisma.favorite.upsert({
      where: { userId_productId: { userId, productId } },
      update: {},
      create: { userId, productId },
    });

    trackSafe("favorite_added", { userId, productId });
    return noStore({ ok: true, added: true, productId }, { status: 201 });
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error("POST /api/favorites error:", e);
    const msg = e instanceof Error ? e.message : "Server error";
    return noStore({ error: msg }, { status: 500 });
  }
}

/* -------------------------------- DELETE -------------------------------- */
export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireUserId();
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(req.headers, {
      name: "favorite_remove",
      limit: 40,
      windowMs: 60_000,
      extraKey: `${userId}:${getIP(req.headers)}`,
    });
    if (!rl.ok) return tooMany("Too many requests.", rl.retryAfterSec);

    const productId = await getProductIdFromReq(req);
    if (!productId) return noStore({ error: "productId is required" }, { status: 400 });

    await prisma.favorite
      .delete({ where: { userId_productId: { userId, productId } } })
      .catch(() => null); // idempotent

    trackSafe("favorite_removed", { userId, productId });
    return noStore({ ok: true, removed: true, productId });
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error("DELETE /api/favorites error:", e);
    const msg = e instanceof Error ? e.message : "Server error";
    return noStore({ error: msg }, { status: 500 });
  }
}

/* --------------------------------- HEAD/OPTIONS --------------------------------- */
export async function HEAD() {
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
