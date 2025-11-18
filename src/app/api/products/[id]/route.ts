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
import { isAdminUser } from "@/app/lib/authz";

/* ---------------- constants ---------------- */
const PLACEHOLDER = "/placeholder/default.jpg";
const IS_PROD = process.env.NODE_ENV === "production";

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

/** Prod-only public cache for ACTIVE-ish public hits (modest TTL). */
function publicCache(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  if (IS_PROD) {
    res.headers.set(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=60"
    );
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

/** Quick heuristic: some IDs are clearly invalid and shouldn't hit DB. */
function isClearlyInvalidId(id: string): boolean {
  const v = (id || "").trim();
  if (!v) return true;
  if (v.length > 128) return true;
  if (v.includes(".")) return true; // likely an asset path
  const bad = new Set(["example", "undefined", "null", "nan"]);
  if (bad.has(v.toLowerCase())) return true;
  return false;
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
  res.headers.set(
    "Vary",
    "Origin, Authorization, Cookie, Accept-Encoding"
  );
  res.headers.set(
    "Access-Control-Allow-Methods",
    "GET, PATCH, DELETE, OPTIONS, HEAD"
  );
  res.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
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
    select: { id: true, username: true, name: true, image: true },
  },
} as const;

/** Runtime-safe shaper */
function shapeProduct(p: any) {
  const favoritesCount: number = p?.["_count"]?.favorites ?? 0;
  const rel = (p as any)?.favorites;
  const isFavoritedByMe = Array.isArray(rel) && rel.length > 0;
  const createdAt =
    p?.createdAt instanceof Date
      ? p.createdAt.toISOString()
      : String(p?.createdAt ?? "");
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
  const candidates = [
    "productImage",
    "productImages",
    "ProductImage",
    "ProductImages",
  ];
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
async function fetchProductRelationUrls(
  productId: string
): Promise<string[]> {
  try {
    const Model = getProductImageModel();
    if (!Model) return [];
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

function normalizeCoverAndGallery(
  primary: any,
  fullRow: any,
  extraUrls: string[] = []
) {
  const merged = { ...(fullRow || {}), ...(primary || {}) };
  const collected = (collectUrls(merged, undefined) ?? []).slice(0, 50);
  const extra = extraUrls
    .map((u) => (u ?? "").toString().trim())
    .filter(Boolean);
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

/* ---------------- timeouts for fast responses ---------------- */
const TIMEOUT_MS = 1200;

const race = <T,>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T | "timeout"> =>
  Promise.race([
    p,
    new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), ms)
    ),
  ]).catch(() => "timeout" as const);

/* ---- accepted alt id fields when resolving a row ---- */
const ALT_ID_FIELDS = [
  "id",
  "productId",
  "product_id",
  "uid",
  "uuid",
  "slug",
] as const;

/* -------------------- GET /api/products/:id ------------------- */
export async function GET(req: NextRequest) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    const productId = getId(req);
    if (!productId) {
      track("product_read_not_found", {
        reqId,
        reason: "missing_id",
      });
      return noStore({ error: "Missing id" }, { status: 400 });
    }

    // ⚡️ Instant short-circuit (no DB): invalid or placeholder ids
    if (isClearlyInvalidId(productId)) {
      track("product_read_not_found", {
        reqId,
        productId,
        reason: "invalid_id",
      });
      const res = noStore({ error: "Not found" }, { status: 404 });
      res.headers.set("x-api-shortcircuit", "invalid-id");
      return res;
    }

    const Product = getProductModel();
    if (!Product) {
      track("product_read_not_found", {
        reqId,
        productId,
        reason: "no_model",
      });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    track("product_read_attempt", { reqId, productId });

    const selectPublic: any = {
      ...productBaseSelect,
      _count: { select: { favorites: true } },
    };

    // Attempt A: fast public ACTIVE row
    const activeItemRaw = await race(
      Product.findFirst({
        where: { id: productId, status: "ACTIVE" },
        select: selectPublic,
      }),
      TIMEOUT_MS
    );
    const activeItem =
      activeItemRaw && activeItemRaw !== "timeout"
        ? (activeItemRaw as any)
        : null;

    // Attempt B (DEV/Preview only): allow any status for public read
    let devLooseItem: any = null;
    if (!activeItem && !IS_PROD) {
      const foundLoose = await race(
        Product.findUnique({
          where: { id: productId },
          select: selectPublic,
        }),
        900
      );
      devLooseItem =
        foundLoose && foundLoose !== "timeout"
          ? (foundLoose as any)
          : null;
    }

    const publicItem = activeItem ?? devLooseItem;

    if (publicItem) {
      const [fullRowRaw, relUrlsRaw] = await Promise.all([
        race(
          Product.findUnique({ where: { id: productId } }).catch(
            () => null
          ),
          600
        ),
        race(fetchProductRelationUrls(productId), 600),
      ]);
      const fullRow =
        fullRowRaw !== "timeout" ? (fullRowRaw as any) : null;
      const relUrls = Array.isArray(relUrlsRaw) ? relUrlsRaw : [];

      const shaped = shapeProduct(publicItem);
      const norm = normalizeCoverAndGallery(shaped, fullRow, relUrls);

      const normGallery = norm.gallery;
      const isPurePlaceholderGallery =
        normGallery.length === 1 && normGallery[0] === PLACEHOLDER;
      const gallery = isPurePlaceholderGallery ? [] : normGallery;

      const payload = {
        ...shaped,
        image: norm.cover,
        gallery,
        imageUrls: gallery,
        images: gallery,
        photos: gallery,
      };

      track("product_read_public_hit", {
        reqId,
        productId,
        favoritesCount:
          (publicItem as any)?.["_count"]?.favorites ?? 0,
        devLoose: !!devLooseItem && !activeItem,
      });
      return publicCache(payload);
    }

    // Owner-gated read as fallback
    const sessionRaw = await race(auth(), 500);
    const session =
      sessionRaw === "timeout" ? null : (sessionRaw as any);
    const sessionUserId = (session?.user as any)?.id as
      | string
      | undefined;

    let userId: string | null = sessionUserId ?? null;
    if (!userId && (session?.user as any)?.email) {
      const uRaw = await race(
        prisma.user.findUnique({
          where: { email: (session?.user as any).email },
          select: { id: true },
        }),
        600
      );
      const u =
        uRaw !== "timeout" ? (uRaw as any) : null;
      userId = u?.id ?? null;
    }

    if (!userId) {
      track("product_read_unauthorized_owner_check", {
        reqId,
        productId,
      });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    const selectOwner: any = {
      ...productBaseSelect,
      _count: { select: { favorites: true } },
      favorites: {
        where: { userId },
        select: { productId: true },
        take: 1,
      },
    };

    const ownerItemRaw = await race(
      Product.findFirst({
        where: { id: productId, sellerId: userId },
        select: selectOwner,
      }),
      TIMEOUT_MS
    );
    const ownerItem =
      ownerItemRaw && ownerItemRaw !== "timeout"
        ? (ownerItemRaw as any)
        : null;

    if (!ownerItem) {
      track("product_read_not_found", {
        reqId,
        productId,
        reason: "no_owner_item_or_timeout",
      });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    const [fullRowRaw, relUrlsRaw] = await Promise.all([
      race(
        Product.findUnique({ where: { id: productId } }).catch(
          () => null
        ),
        600
      ),
      race(fetchProductRelationUrls(productId), 600),
    ]);
    const fullRow =
      fullRowRaw !== "timeout" ? (fullRowRaw as any) : null;
    const relUrls = Array.isArray(relUrlsRaw) ? relUrlsRaw : [];

    const shapedOwner = shapeProduct(ownerItem);
    const normOwner = normalizeCoverAndGallery(
      shapedOwner,
      fullRow,
      relUrls
    );

    const ownerNormGallery = normOwner.gallery;
    const ownerPurePlaceholder =
      ownerNormGallery.length === 1 &&
      ownerNormGallery[0] === PLACEHOLDER;
    const ownerGallery = ownerPurePlaceholder ? [] : ownerNormGallery;

    const ownerPayload = {
      ...shapedOwner,
      image: normOwner.cover,
      gallery: ownerGallery,
      imageUrls: ownerGallery,
      images: ownerGallery,
      photos: ownerGallery,
    };

    track("product_read_owner_hit", { reqId, productId });
    return noStore(ownerPayload);
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
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    const idParam = getId(req);
    if (!idParam) {
      track("product_update_not_found", {
        reqId,
        reason: "missing_id",
      });
      return noStore({ error: "Missing id" }, { status: 400 });
    }

    const Product = getProductModel();
    if (!Product) {
      track("product_update_not_found", {
        reqId,
        idParam,
        reason: "no_model",
      });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    track("product_update_attempt", { reqId, idParam });

    const session = await auth();
    const userId = (session as any)?.user?.id as
      | string
      | undefined;
    if (!userId) {
      track("product_update_unauthorized", { reqId, idParam });
      return noStore(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Resolve existing by alternate id fields too
    let existing: any = null;
    for (const field of ALT_ID_FIELDS) {
      try {
        const where = { [field]: idParam } as any;
        existing = await Product.findUnique({
          where,
          select: { id: true, sellerId: true },
        });
        if (existing) break;
      } catch {}
    }
    if (!existing) {
      track("product_update_not_found", {
        reqId,
        idParam,
        reason: "no_existing",
      });
      return noStore({ error: "Not found" }, { status: 404 });
    }
    if (existing.sellerId && existing.sellerId !== userId) {
      track("product_update_forbidden", { reqId, idParam });
      return noStore({ error: "Forbidden" }, { status: 403 });
    }

    const ctype = req.headers.get("content-type") || "";
    if (
      !ctype
        .toLowerCase()
        .includes("application/json")
    ) {
      return noStore(
        {
          error:
            "Content-Type must be application/json",
        },
        { status: 415 }
      );
    }

    const body: any = await req
      .json()
      .catch(() => ({}));

    const normCondition = (() => {
      const t = String(
        body?.condition ?? ""
      )
        .trim()
        .toLowerCase();
      if (!t) return undefined;
      if (
        [
          "brand new",
          "brand-new",
          "brand_new",
          "new",
        ].includes(t)
      )
        return "brand new";
      if (
        [
          "pre-owned",
          "pre owned",
          "pre_owned",
          "used",
        ].includes(t)
      )
        return "pre-owned";
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

    const normGallery = Array.isArray(
      body?.gallery
    )
      ? body.gallery
          .map((x: unknown) =>
            String(x || "")
          )
          .filter(Boolean)
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
      status?:
        | "ACTIVE"
        | "SOLD"
        | "HIDDEN"
        | "DRAFT"
        | "ARCHIVED";
    } = {};

    if (typeof body?.name === "string")
      data.name = body.name
        .trim()
        .slice(0, 140);
    if (
      typeof body?.description ===
        "string" ||
      body?.description === null
    )
      data.description =
        body?.description ?? null;
    if (
      typeof body?.category ===
      "string"
    )
      data.category = body.category.slice(
        0,
        64
      );
    if (
      typeof body?.subcategory ===
        "string" ||
      body?.subcategory === null
    )
      data.subcategory =
        body?.subcategory ?? null;
    if (
      typeof body?.brand === "string"
    )
      data.brand = body.brand.slice(
        0,
        64
      );
    if (normCondition !== undefined)
      data.condition = normCondition;
    if (normPrice !== undefined)
      data.price = normPrice;
    if (
      typeof body?.image ===
        "string" ||
      body?.image === null
    )
      data.image = body?.image ?? null;
    if (normGallery !== undefined)
      data.gallery = normGallery;
    if (
      typeof body?.location ===
        "string" ||
      body?.location === null
    )
      data.location =
        body?.location ?? null;
    if (
      typeof body?.negotiable ===
      "boolean"
    )
      data.negotiable =
        body.negotiable;
    if (normStatus !== undefined)
      data.status = normStatus as any;

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
      where: { id: existing.id },
      data,
      select,
    });

    const [fullRow, relUrls] =
      await Promise.all([
        Product.findUnique({
          where: { id: existing.id },
        }).catch(() => null),
        (async () => {
          const g: string[] =
            Array.isArray(data.gallery)
              ? data.gallery
              : fullRow?.gallery ??
                [];
          if (
            Array.isArray(g) &&
            g.length > 0
          )
            return [] as string[];
          return fetchProductRelationUrls(
            existing.id
          ).catch(
            () =>
              [] as string[]
          );
        })(),
      ]);

    const shaped = shapeProduct(updated);
    const norm = normalizeCoverAndGallery(
      { ...shaped, ...(body || {}) },
      fullRow,
      relUrls
    );

    const normGallery2 = norm.gallery;
    const isPurePlaceholderGallery =
      normGallery2.length === 1 &&
      normGallery2[0] === PLACEHOLDER;
    const gallery = isPurePlaceholderGallery
      ? []
      : normGallery2;

    try {
      revalidateTag("home:active");
      revalidateTag("products:latest");
      revalidateTag(
        `product:${existing.id}`
      );
      revalidateTag(
        `user:${userId}:listings`
      );
      revalidatePath("/");
      revalidatePath(
        `/product/${existing.id}`
      );
      revalidatePath(
        `/listing/${existing.id}`
      );
    } catch {}

    const payload = {
      ...shaped,
      id: String(existing.id),
      image: norm.cover,
      gallery,
      imageUrls: gallery,
      images: gallery,
      photos: gallery,
    };

    track("product_update_success", {
      reqId,
      idParam,
      productId: existing.id,
      favoritesCount:
        (updated as any)?.["_count"]
          ?.favorites ?? 0,
    });

    return noStore(payload);
  } catch (e) {
    console.warn("[products/:id PATCH] error:", e);
    track("product_update_error", {
      reqId,
      message:
        (e as any)?.message ??
        String(e),
    });
    return noStore(
      { error: "Server error" },
      { status: 500 }
    );
  }
}

/* ------------------ DELETE /api/products/:id ------------------ */
export async function DELETE(req: NextRequest) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    const idParam = getId(req);
    if (!idParam) {
      track("product_delete_not_found", {
        reqId,
        reason: "missing_id",
      });
      return noStore({ error: "Missing id" }, { status: 400 });
    }

    const Product = getProductModel();
    if (!Product) {
      track("product_delete_not_found", {
        reqId,
        idParam,
        reason: "no_model",
      });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    track("product_delete_attempt", {
      reqId,
      idParam,
    });

    const session = await auth();
    const s: any = session?.user ?? {};
    const userId: string | undefined = s?.id;
    const isAdmin = !!isAdminUser(s);

    if (!userId && !isAdmin) {
      track("product_delete_unauthorized", {
        reqId,
        idParam,
      });
      return noStore(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Resolve row (accept alt id fields)
    let existing: any = null;
    for (const field of ALT_ID_FIELDS) {
      try {
        const where = { [field]: idParam } as any;
        existing = await Product.findUnique({
          where,
          select: { id: true, sellerId: true },
        });
        if (existing) break;
      } catch {}
    }
    if (!existing) {
      track("product_delete_not_found", {
        reqId,
        idParam,
        reason: "no_existing",
      });
      return noStore({ error: "Not found" }, { status: 404 });
    }

    const isOwner =
      !!userId && existing.sellerId === userId;
    if (!isOwner && !isAdmin) {
      track("product_delete_forbidden", {
        reqId,
        idParam,
      });
      return noStore(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    await prisma.$transaction([
      prisma.favorite.deleteMany({
        where: { productId: existing.id },
      }),
      Product.delete({
        where: { id: existing.id },
      }),
    ]);

    try {
      revalidateTag("home:active");
      revalidateTag("products:latest");
      revalidateTag(
        `product:${existing.id}`
      );
      if (userId)
        revalidateTag(
          `user:${userId}:listings`
        );
      revalidatePath("/");
      revalidatePath(
        `/product/${existing.id}`
      );
      revalidatePath(
        `/listing/${existing.id}`
      );
    } catch {}

    track("product_delete_success", {
      reqId,
      productId: existing.id,
    });
    return noStore({ ok: true });
  } catch (e) {
    console.warn("[products/:id DELETE] error:", e);
    track("product_delete_error", {
      reqId,
      message:
        (e as any)?.message ??
        String(e),
    });
    return noStore(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
