// src/app/api/products/[id]/route.ts
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath, revalidateTag } from "next/cache";
import { extractGalleryUrls as collectUrls } from "@/app/lib/media";

/* ---------------- constants ---------------- */
const PLACEHOLDER = "/placeholder/default.jpg";

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
    console.log(`[track] ${event}`, { ts: new Date().toISOString(), ...props });
  } catch {}
}

/* -------------------------- helpers -------------------------- */
function baseHeaders(h = new Headers()) {
  h.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
  return h;
}

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  baseHeaders(res.headers);
  return res;
}

/** Prod-only public cache for ACTIVE public hits (keep modest TTLs). */
function publicCache(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  const prod = process.env.NODE_ENV === "production";
  if (prod) {
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=60");
  } else {
    res.headers.set("Cache-Control", "no-store");
  }
  baseHeaders(res.headers);
  return res;
}

function getId(req: NextRequest): string {
  try {
    const segs = req.nextUrl.pathname.split("/");
    const idx = segs.findIndex((s) => s === "products");
    const id = idx >= 0 ? (segs[idx + 1] ?? "") : "";
    return id.trim();
  } catch {
    return "";
  }
}

/* ----------------------------- HEAD / CORS ----------------------------- */
export function HEAD() {
  const h = baseHeaders(new Headers());
  h.set("Allow", "GET, PATCH, DELETE, OPTIONS, HEAD");
  h.set("Cache-Control", "no-store, no-cache, must-revalidate");
  h.set("Pragma", "no-cache");
  h.set("Expires", "0");
  return new Response(null, { status: 204, headers: h });
}

export function OPTIONS() {
  const origin =
    process.env["NEXT_PUBLIC_APP_URL"] ??
    process.env["APP_ORIGIN"] ??
    "*";

  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin, Authorization, Cookie, Accept-Encoding");
  res.headers.set("Access-Control-Allow-Methods", "GET, PATCH, DELETE, OPTIONS, HEAD");
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

  status: true,

  sellerName: true,
  sellerLocation: true,
  sellerMemberSince: true,
  sellerRating: true,
  sellerSales: true,

  seller: {
    select: {
      id: true,
      username: true,
      name: true,
      image: true,
    },
  },
} as const;

/** Runtime-safe shaper */
function shapeProduct(p: any) {
  const favoritesCount: number = p?.["_count"]?.favorites ?? 0;
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
    sellerUsername,
  };
}

/* ---------- model helpers (handle Product/Products naming) ------------ */
function getProductModel() {
  const any = prisma as any;
  return any.product ?? any.products ?? any.Product ?? any.Products ?? null;
}

/* ---------- relation model helpers (ProductImage[]) ------------ */
function getProductImageModel() {
  const any = prisma as any;
  const candidates = ["productImage", "productImages", "ProductImage", "ProductImages"];
  for (const key of candidates) {
    const mdl = any?.[key];
    if (mdl && typeof mdl.findMany === "function") return mdl;
  }
  return null;
}

/**
 * Fetch related image URLs without selecting non-existent columns.
 * We avoid `select` entirely and then read from common URL-ish keys.
 */
async function fetchProductRelationUrls(productId: string): Promise<string[]> {
  try {
    const Model = getProductImageModel();
    if (!Model) return [];

    // No `select` → Prisma returns only actual model fields (whatever they are).
    const rows: any[] =
      (await Model.findMany({
        where: { productId },
        orderBy: { id: "asc" },
        take: 50,
      }).catch(() => [])) ?? [];

    const urls = new Set<string>();
    for (const r of rows) {
      const u =
        r?.url ??
        r?.src ??
        r?.href ??
        r?.uri ??
        r?.imageUrl ??
        r?.image ??
        r?.path ??
        r?.location ??
        "";
      const t = String(u ?? "").trim();
      if (t) urls.add(t);
    }
    return Array.from(urls);
  } catch {
    return [];
  }
}

/* -------- gallery normalization using shared util -------- */
function isPlaceholder(u?: string | null) {
  if (!u) return false;
  const s = String(u).trim();
  if (!s) return false;
  return s === PLACEHOLDER || s.endsWith("/placeholder/default.jpg");
}

function normalizeCoverAndGallery(primary: any, fullRow: any, extraUrls: string[] = []) {
  const merged = { ...(fullRow || {}), ...(primary || {}) };
  const collected = (collectUrls(merged, undefined) ?? []).slice(0, 50);
  const extra = extraUrls.map((u) => (u ?? "").toString().trim()).filter(Boolean);
  const rawCandidates = [
    merged?.image,
    merged?.coverImage,
    merged?.coverImageUrl,
    ...collected,
    ...extra,
  ]
    .map((u: any) => (u ?? "").toString().trim())
    .filter(Boolean);

  const firstReal = rawCandidates.find((u) => !isPlaceholder(u));
  const cover = firstReal || PLACEHOLDER;

  const realGallery = rawCandidates.filter((u) => !isPlaceholder(u));
  const gallery = realGallery.length
    ? Array.from(new Set([cover, ...realGallery]))
    : [PLACEHOLDER];

  return { cover, gallery: gallery.slice(0, 50) };
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

    const Product = getProductModel();
    if (!Product) {
      track("product_read_not_found", { reqId, productId, reason: "no_model" });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    track("product_read_attempt", { reqId, productId });

    const selectPublic: any = {
      ...productBaseSelect,
      _count: { select: { favorites: true } },
    };

    // Fetch in parallel
    const activePromise = Product.findFirst({
      where: { id: productId, status: "ACTIVE" },
      select: selectPublic,
    });
    const fullRowPromise = Product.findUnique({ where: { id: productId } }).catch(() => null);
    const relUrlsPromise = fetchProductRelationUrls(productId);

    const [activeItem, fullRow, relUrls] = await Promise.all([
      activePromise,
      fullRowPromise,
      relUrlsPromise,
    ]);

    if (activeItem) {
      const shaped = shapeProduct(activeItem);
      const norm = normalizeCoverAndGallery(shaped, fullRow, relUrls);
      track("product_read_public_hit", {
        reqId,
        productId,
        favoritesCount: (activeItem as any)?.["_count"]?.favorites ?? 0,
      });
      return publicCache({ ...shaped, image: norm.cover, gallery: norm.gallery });
    }

    // Not public → owner-gated
    const session = await auth().catch(() => null);
    const sessionUserId = (session?.user as any)?.id as string | undefined;
    let userId: string | null = sessionUserId ?? null;
    if (!userId && (session?.user as any)?.email) {
      const u = await prisma.user.findUnique({
        where: { email: (session?.user as any).email },
        select: { id: true },
      });
      userId = u?.id ?? null;
    }

    const ownerId = userId;
    if (!ownerId) {
      track("product_read_unauthorized_owner_check", { reqId, productId });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    const selectOwner: any = {
      ...productBaseSelect,
      _count: { select: { favorites: true } },
    };
    if (userId) {
      selectOwner.favorites = {
        where: { userId },
        select: { productId: true },
        take: 1,
      };
    }

    const ownerItem = await Product.findFirst({
      where: { id: productId, sellerId: ownerId },
      select: selectOwner,
    });
    if (!ownerItem) {
      track("product_read_not_found", { reqId, productId, reason: "no_owner_item" });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    const shapedOwner = shapeProduct(ownerItem);
    const normOwner = normalizeCoverAndGallery(shapedOwner, fullRow, relUrls);
    track("product_read_owner_hit", { reqId, productId });
    return noStore({ ...shapedOwner, image: normOwner.cover, gallery: normOwner.gallery });
  } catch (e) {
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

    const Product = getProductModel();
    if (!Product) {
      track("product_update_not_found", { reqId, productId, reason: "no_model" });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    track("product_update_attempt", { reqId, productId });

    const session = await auth();
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) {
      track("product_update_unauthorized", { reqId, productId });
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await Product.findUnique({
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
      if (!t) return undefined;
      if (["brand new", "brand-new", "brand_new", "new"].includes(t)) return "brand new";
      if (["pre-owned", "pre owned", "pre_owned", "used"].includes(t)) return "pre-owned";
      return undefined;
    })();

    const normPrice =
      typeof body?.price === "number"
        ? Math.max(0, Math.round(body.price))
        : body?.price === null
        ? null
        : undefined;

    const normStatus =
      body?.status === "ACTIVE" ||
      body?.status === "SOLD" ||
      body?.status === "HIDDEN" ||
      body?.status === "DRAFT" ||
      body?.status === "ARCHIVED"
        ? body.status
        : body?.status == null
        ? undefined
        : undefined;

    const normGallery = Array.isArray(body?.gallery)
      ? body.gallery.map((x: unknown) => String(x || "")).filter(Boolean)
      : undefined;

    const data: {
      name?: string;
      description?: string | null;
      category?: string;
      subcategory?: string | null;
      brand?: string;
      condition?: string | null;
      price?: number | null;
      image?: string | null;
      gallery?: string[];
      location?: string | null;
      negotiable?: boolean;
      status?: "ACTIVE" | "SOLD" | "HIDDEN" | "DRAFT" | "ARCHIVED";
    } = {};

    if (typeof body?.name === "string") data.name = body.name.trim().slice(0, 140);
    if (typeof body?.description === "string" || body?.description === null)
      data.description = body?.description ?? null;
    if (typeof body?.category === "string") data.category = body.category.slice(0, 64);
    if (typeof body?.subcategory === "string" || body?.subcategory === null)
      data.subcategory = body?.subcategory ?? null;
    if (typeof body?.brand === "string") data.brand = body.brand.slice(0, 64);
    if (normCondition !== undefined) data.condition = normCondition;
    if (normPrice !== undefined) data.price = normPrice;
    if (typeof body?.image === "string" || body?.image === null) data.image = body?.image ?? null;
    if (normGallery !== undefined) data.gallery = normGallery;
    if (typeof body?.location === "string" || body?.location === null)
      data.location = body?.location ?? null;
    if (typeof body?.negotiable === "boolean") data.negotiable = body.negotiable;
    if (normStatus !== undefined) data.status = normStatus as any;

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

    const updated = await Product.update({
      where: { id: productId },
      data,
      select,
    });

    const [fullRow, relUrls] = await Promise.all([
      Product.findUnique({ where: { id: productId } }).catch(() => null),
      fetchProductRelationUrls(productId),
    ]);

    const shaped = shapeProduct(updated);
    const norm = normalizeCoverAndGallery({ ...shaped, ...(body || {}) }, fullRow, relUrls);

    try {
      revalidateTag("home:active");
      revalidateTag("products:latest");
      revalidateTag(`product:${productId}`);
      revalidateTag(`user:${userId}:listings`);
      revalidatePath("/");
      revalidatePath(`/product/${productId}`);
      revalidatePath(`/listing/${productId}`);
    } catch {}

    track("product_update_success", {
      reqId,
      productId,
      favoritesCount: (updated as any)?.["_count"]?.favorites ?? 0,
    });

    return noStore({ ...shaped, image: norm.cover, gallery: norm.gallery });
  } catch (e) {
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

    const Product = getProductModel();
    if (!Product) {
      track("product_delete_not_found", { reqId, productId, reason: "no_model" });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    track("product_delete_attempt", { reqId, productId });

    const session = await auth();
    const s: any = session?.user ?? {};
    const userId: string | undefined = s?.id;
    const email: string | undefined =
      typeof s?.email === "string" ? s.email : undefined;
    const role: string | undefined = typeof s?.role === "string" ? s.role : undefined;
    const isAdminFlag: boolean =
      s?.isAdmin === true || role?.toUpperCase?.() === "ADMIN";

    const adminEmails = (process.env["ADMIN_EMAILS"] ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const emailIsAdmin = !!email && adminEmails.includes(email.toLowerCase());

    const isAdmin = isAdminFlag || emailIsAdmin;

    if (!userId && !isAdmin) {
      track("product_delete_unauthorized", { reqId, productId });
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await Product.findUnique({
      where: { id: productId },
      select: { id: true, sellerId: true },
    });
    if (!existing) {
      track("product_delete_not_found", {
        reqId,
        productId,
        reason: "no_existing",
      });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    const isOwner = !!userId && existing.sellerId === userId;
    if (!isOwner && !isAdmin) {
      track("product_delete_forbidden", { reqId, productId });
      return noStore({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.$transaction([
      prisma.favorite.deleteMany({ where: { productId } }),
      Product.delete({ where: { id: productId } }),
    ]);

    try {
      revalidateTag("home:active");
      revalidateTag("products:latest");
      revalidateTag(`product:${productId}`);
      if (userId) revalidateTag(`user:${userId}:listings`);
      revalidatePath("/");
      revalidatePath(`/product/${productId}`);
      revalidatePath(`/listing/${productId}`);
    } catch {}

    track("product_delete_success", { reqId, productId });

    return noStore({ ok: true });
  } catch (e) {
    console.warn("[products/:id DELETE] error:", e);
    track("product_delete_error", {
      reqId,
      message: (e as any)?.message ?? String(e),
    });
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
