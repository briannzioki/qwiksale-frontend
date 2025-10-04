// src/app/api/products/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { auth } from "@/auth";
import { revalidatePath, revalidateTag } from "next/cache";

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

function getId(req: NextRequest): string {
  try {
    // Prefer NextRequest.nextUrl for robustness
    const segs = req.nextUrl.pathname.split("/");
    const idx = segs.findIndex((s) => s === "products");
    const id = idx >= 0 ? (segs[idx + 1] ?? "") : "";
    return id.trim();
  } catch {
    return "";
  }
}

// CORS (optional)
export function OPTIONS() {
  const origin =
    process.env["NEXT_PUBLIC_APP_URL"] ??
    process.env["NEXT_PUBLIC_APP_URL"] ??
    "*";

  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "GET, PATCH, DELETE, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
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

  // linked seller (safe fields only; includes username)
  seller: {
    select: {
      id: true,
      username: true, // <- ensure username is included
      name: true,
      image: true,
    },
  },
} as const;

/** Runtime-safe shaper: never assume `_count` or `favorites` exist */
function shapeProduct(p: any) {
  const favoritesCount: number = p?.["_count"]?.favorites ?? 0;

  // only true if we selected the relation and a row exists
  const rel = (p as any)?.favorites;
  const isFavoritedByMe = Array.isArray(rel) && rel.length > 0;

  const createdAt =
    p?.createdAt instanceof Date ? p.createdAt.toISOString() : String(p?.createdAt ?? "");

  const sellerUsername = p?.seller?.username ?? null;

  const { _count: _c, favorites: _f, ...rest } = p || {};
  return {
    ...rest,
    createdAt,
    favoritesCount,
    isFavoritedByMe,
    sellerUsername, // convenience mirror on the root payload
  };
}

/* -------------------- GET /api/products/:id ------------------- */
export async function GET(req: NextRequest) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  try {
    const productId = getId(req);
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

    // 1) Try public (ACTIVE)
    const activeItem = await prisma.product.findFirst({
      where: { id: productId, status: "ACTIVE" },
      select,
    });
    if (activeItem) {
      track("product_read_public_hit", {
        reqId,
        productId,
        favoritesCount: (activeItem as any)?.["_count"]?.favorites ?? 0,
      });
      return noStore(shapeProduct(activeItem));
    }

    // 2) Owner may view non-ACTIVE
    const ownerId = userId;
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
export async function PATCH(req: NextRequest) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  try {
    const productId = getId(req);
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

    const existing = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, sellerId: true },
    });
    if (!existing) {
      track("product_update_not_found", { reqId, productId, reason: "no_existing" });
      return noStore({ error: "Not found" }, { status: 404 });
    }
    if (existing.sellerId && existing.sellerId !== userId) {
      track("product_update_forbidden", { reqId, productId });
      return noStore({ error: "Forbidden" }, { status: 403 });
    }

    const ctype = req.headers.get("content-type") || "";
    if (!ctype.toLowerCase().includes("application/json")) {
      return noStore({ error: "Content-Type must be application/json" }, { status: 415 });
    }

    const body: any = await req.json().catch(() => ({}));

    const normCondition = (() => {
      const t = String(body?.condition ?? "").trim().toLowerCase();
      if (!t) return undefined; // undefined means "don't touch"
      if (["brand new", "brand-new", "brand_new", "new"].includes(t)) return "brand new";
      if (["pre-owned", "pre owned", "pre_owned", "used"].includes(t)) return "pre-owned";
      return undefined; // ignore unknown condition values
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

    // IMPORTANT: only set keys that are defined (TS exactOptionalPropertyTypes)
    const data: {
      name?: string;
      description?: string;
      category?: string;
      subcategory?: string;
      brand?: string;
      condition?: string | null;
      price?: number | null;
      image?: string;
      gallery?: string[];
      location?: string;
      negotiable?: boolean;
    } = {};

    if (typeof body?.name === "string") data.name = body.name.trim().slice(0, 140);
    if (typeof body?.description === "string") data.description = body.description.slice(0, 5000);
    if (typeof body?.category === "string") data.category = body.category.slice(0, 64);
    if (typeof body?.subcategory === "string") data.subcategory = body.subcategory.slice(0, 64);
    if (typeof body?.brand === "string") data.brand = body.brand.slice(0, 64);
    if (normCondition !== undefined) data.condition = normCondition;
    if (normPrice !== undefined) data.price = normPrice; // number | null | undefined
    if (typeof body?.image === "string") data.image = body.image.slice(0, 2048);
    if (normGallery !== undefined) data.gallery = normGallery;
    if (typeof body?.location === "string") data.location = body.location.slice(0, 120);
    if (typeof body?.negotiable === "boolean") data.negotiable = body.negotiable;

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

    const updated = await prisma.product.update({
      where: { id: productId },
      data,
      select,
    });

    // ---- revalidate caches after update ----
    try {
      revalidateTag("home:active");
      revalidateTag("products:latest");
      revalidateTag(`product:${productId}`);
      revalidateTag(`user:${userId}:listings`);
      revalidatePath("/");
      revalidatePath(`/product/${productId}`);
      revalidatePath(`/listing/${productId}`);
    } catch {
      /* best-effort */
    }

    track("product_update_success", {
      reqId,
      productId,
      favoritesCount: (updated as any)?.["_count"]?.favorites ?? 0,
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
export async function DELETE(req: NextRequest) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

  try {
    const productId = getId(req);
    if (!productId) {
      track("product_delete_not_found", { reqId, reason: "missing_id" });
      return noStore({ error: "Missing id" }, { status: 400 });
    }

    track("product_delete_attempt", { reqId, productId });

    const session = await auth();
    const s: any = session?.user ?? {};
    const userId: string | undefined = s?.id;
    const email: string | undefined = typeof s?.email === "string" ? s.email : undefined;
    const role: string | undefined = typeof s?.role === "string" ? s.role : undefined;
    const isAdminFlag: boolean = s?.isAdmin === true || (role?.toUpperCase?.() === "ADMIN");

    // Admin allow-list fallback via env
    const adminEmails = (process.env['ADMIN_EMAILS'] ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const emailIsAdmin = !!email && adminEmails.includes(email.toLowerCase());

    const isAdmin = isAdminFlag || emailIsAdmin;

    if (!userId && !isAdmin) {
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

    // Owner OR Admin can delete
    const isOwner = !!userId && existing.sellerId === userId;
    if (!isOwner && !isAdmin) {
      track("product_delete_forbidden", { reqId, productId });
      return noStore({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.$transaction([
      prisma.favorite.deleteMany({ where: { productId } }),
      prisma.product.delete({ where: { id: productId } }),
    ]);

    // ---- revalidate caches after delete ----
    try {
      revalidateTag("home:active");
      revalidateTag("products:latest");
      revalidateTag(`product:${productId}`);
      if (userId) revalidateTag(`user:${userId}:listings`);
      revalidatePath("/");
      revalidatePath(`/product/${productId}`);
      revalidatePath(`/listing/${productId}`);
    } catch {
      /* best-effort */
    }

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
