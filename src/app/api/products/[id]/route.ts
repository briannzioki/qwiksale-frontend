// src/app/api/products/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

/* ---------------- analytics (console-only for now) ---------------- */
type AnalyticsEvent =
  | "product_read_attempt"
  | "product_read_public_hit"
  | "product_read_owner_hit"
  | "product_read_not_found"
  | "product_read_unauthorized_owner_check"
  | "product_read_error"
  | "product_update_attempt"
  | "product_update_unauthorized"
  | "product_update_forbidden"
  | "product_update_not_found"
  | "product_update_success"
  | "product_update_error"
  | "product_delete_attempt"
  | "product_delete_unauthorized"
  | "product_delete_forbidden"
  | "product_delete_not_found"
  | "product_delete_success"
  | "product_delete_error";

function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  try {
    // keep it simple + non-PII; swap this for GA/Plausible/PostHog later
    // eslint-disable-next-line no-console
    console.log(`[track] ${event}`, { ts: new Date().toISOString(), ...props });
  } catch {
    /* no-op */
  }
}

/* -------------------------- helpers -------------------------- */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

// Next 15: params may be object or Promise
type CtxLike = { params?: { id: string } | Promise<{ id: string }> } | unknown;
async function getId(ctx: CtxLike): Promise<string> {
  const p: any = (ctx as any)?.params;
  const value = p && typeof p.then === "function" ? await p : p;
  return String(value?.id ?? "").trim();
}

/** base select for product (safe fields) */
const productBaseSelect = {
  id: true,
  name: true,
  description: true,
  category: true,
  subcategory: true,
  brand: true,
  condition: true,
  price: true,
  image: true,
  gallery: true,
  location: true,
  negotiable: true,
  createdAt: true,
  featured: true,
  sellerId: true,

  // flattened snapshot (safe)
  sellerName: true,
  sellerLocation: true,
  sellerMemberSince: true,
  sellerRating: true,
  sellerSales: true,

  // linked seller (no email/phone)
  seller: {
    select: {
      id: true,
      name: true,
      image: true,
      subscription: true,
      username: true,
    },
  },
} as const;

function shapeProduct(p: any) {
  const favoritesCount: number = p?._count?.favorites ?? 0;
  const isFavoritedByMe: boolean = Array.isArray(p?.favorites)
    ? p.favorites.length > 0
    : false;

  const createdAt =
    p?.createdAt instanceof Date ? p.createdAt.toISOString() : String(p?.createdAt ?? "");

  const { _count, favorites, ...rest } = p || {};
  return {
    ...rest,
    createdAt,
    favoritesCount,
    isFavoritedByMe,
  };
}

/* -------------------- GET /api/products/:id ------------------- */
export async function GET(_req: NextRequest, ctx: CtxLike) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    const productId = await getId(ctx);
    if (!productId) {
      track("product_read_not_found", { reqId, reason: "missing_id" });
      return noStore({ error: "Missing id" }, { status: 400 });
    }

    track("product_read_attempt", { reqId, productId });

    // Resolve current user (optional; improves isFavoritedByMe)
    const session = await auth().catch(() => null);
    const sessionUserId = (session?.user as any)?.id as string | undefined;
    let userId: string | null = sessionUserId ?? null;
    if (!userId && session?.user?.email) {
      const u = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });
      userId = u?.id ?? null;
    }

    // Build select: always count favorites; only fetch relation when we have userId
    const select: any = {
      ...productBaseSelect,
      _count: { select: { favorites: true } },
    };
    if (userId) {
      select.favorites = {
        where: { userId },
        select: { productId: true },
        take: 1,
      };
    }

    // 1) Try public (ACTIVE) fetch first
    const activeItem = await prisma.product.findFirst({
      where: { id: productId, status: "ACTIVE" },
      select,
    });
    if (activeItem) {
      track("product_read_public_hit", {
        reqId,
        productId,
        favoritesCount: activeItem?._count?.favorites ?? 0,
      });
      return noStore(shapeProduct(activeItem));
    }

    // 2) Allow owner to view non-ACTIVE items (draft/hidden/sold)
    const ownerId = userId; // userId derived above
    if (!ownerId) {
      track("product_read_unauthorized_owner_check", { reqId, productId });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    const ownerItem = await prisma.product.findFirst({
      where: { id: productId, sellerId: ownerId },
      select,
    });
    if (!ownerItem) {
      track("product_read_not_found", { reqId, productId, reason: "no_owner_item" });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    track("product_read_owner_hit", { reqId, productId });
    return noStore(shapeProduct(ownerItem));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[products/:id GET] error:", e);
    track("product_read_error", {
      reqId,
      message: (e as any)?.message ?? String(e),
    });
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ------------------- PATCH /api/products/:id ------------------ */
export async function PATCH(req: NextRequest, ctx: CtxLike) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    const productId = await getId(ctx);
    if (!productId) {
      track("product_update_not_found", { reqId, reason: "missing_id" });
      return noStore({ error: "Missing id" }, { status: 400 });
    }

    track("product_update_attempt", { reqId, productId });

    const session = await auth();
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) {
      track("product_update_unauthorized", { reqId, productId });
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await prisma.product.findUnique({ where: { id: productId } });
    if (!existing) {
      track("product_update_not_found", { reqId, productId, reason: "no_existing" });
      return noStore({ error: "Not found" }, { status: 404 });
    }
    if (existing.sellerId && existing.sellerId !== userId) {
      track("product_update_forbidden", { reqId, productId });
      return noStore({ error: "Forbidden" }, { status: 403 });
    }

    const body: any = await req.json().catch(() => ({}));

    const normCondition = (() => {
      const t = String(body?.condition ?? "").trim().toLowerCase();
      if (!t) return undefined;
      if (["brand new", "brand-new", "brand_new"].includes(t)) return "brand new";
      if (["pre-owned", "pre owned", "pre_owned", "used"].includes(t)) return "pre-owned";
      return undefined;
    })();

    const normPrice =
      typeof body?.price === "number"
        ? Math.max(0, Math.round(body.price))
        : body?.price === null
        ? null
        : undefined;

    const normGallery = Array.isArray(body?.gallery)
      ? body.gallery.map((x: unknown) => String(x || "")).filter(Boolean)
      : undefined;

    const data = {
      name: typeof body?.name === "string" ? body.name.trim() : undefined,
      description: typeof body?.description === "string" ? body.description : undefined,
      category: typeof body?.category === "string" ? body.category : undefined,
      subcategory: typeof body?.subcategory === "string" ? body.subcategory : undefined,
      brand: typeof body?.brand === "string" ? body.brand : undefined,
      condition: normCondition,
      price: normPrice,
      image: typeof body?.image === "string" ? body.image : undefined,
      gallery: normGallery,
      location: typeof body?.location === "string" ? body.location : undefined,
      negotiable: typeof body?.negotiable === "boolean" ? body.negotiable : undefined,
      // status intentionally NOT changeable here (keep separate admin/owner flow)
    };

    // use same select to keep response consistent (adds favorites fields)
    const select: any = {
      ...productBaseSelect,
      _count: { select: { favorites: true } },
      favorites: {
        where: { userId },
        select: { productId: true },
        take: 1,
      },
    };

    const updated = await prisma.product.update({
      where: { id: productId },
      data,
      select,
    });

    track("product_update_success", {
      reqId,
      productId,
      favoritesCount: updated?._count?.favorites ?? 0,
    });

    return noStore(shapeProduct(updated));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[products/:id PATCH] error:", e);
    track("product_update_error", {
      reqId,
      message: (e as any)?.message ?? String(e),
    });
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ------------------ DELETE /api/products/:id ------------------ */
export async function DELETE(_req: NextRequest, ctx: CtxLike) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    const productId = await getId(ctx);
    if (!productId) {
      track("product_delete_not_found", { reqId, reason: "missing_id" });
      return noStore({ error: "Missing id" }, { status: 400 });
    }

    track("product_delete_attempt", { reqId, productId });

    const session = await auth();
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) {
      track("product_delete_unauthorized", { reqId, productId });
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, sellerId: true },
    });
    if (!existing) {
      track("product_delete_not_found", { reqId, productId, reason: "no_existing" });
      return noStore({ error: "Not found" }, { status: 404 });
    }
    if (existing.sellerId && existing.sellerId !== userId) {
      track("product_delete_forbidden", { reqId, productId });
      return noStore({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.$transaction([
      prisma.favorite.deleteMany({ where: { productId } }),
      prisma.product.delete({ where: { id: productId } }),
    ]);

    track("product_delete_success", { reqId, productId });

    return noStore({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[products/:id DELETE] error:", e);
    track("product_delete_error", {
      reqId,
      message: (e as any)?.message ?? String(e),
    });
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
