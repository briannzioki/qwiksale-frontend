// src/app/api/products/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // CDN can still cache via s-maxage below.
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { jsonPublic, jsonPrivate } from "@/app/api/_lib/responses";
import type { FeaturedTier } from "@/app/lib/sellerVerification";
import {
  buildSellerBadgeFields,
  resolveSellerBadgeFieldsFromUserLike,
} from "@/app/lib/sellerVerification";

/* ----------------------------- debug ----------------------------- */
const PRODUCTS_VER = "vDEBUG-PRODUCTS-012";
const DB_TIMEOUT_MS = 1800; // soft cap to avoid client hangs

function attachVersion(h: Headers) {
  h.set("X-Products-Version", PRODUCTS_VER);
}
function safe(obj: unknown) {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}
async function softTimeout<T>(
  work: () => Promise<T>,
  ms: number,
  fallback: () => T | Promise<T>,
): Promise<T> {
  return Promise.race([
    work(),
    new Promise<T>((resolve) => setTimeout(async () => resolve(await fallback()), ms)),
  ]);
}

/* ----------------------------- tiny helpers ----------------------------- */
function toInt(v: string | null | undefined, def: number, min: number, max: number) {
  if (v == null || v.trim() === "") return def; // treat null/blank as unset
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
function toBool(v: string | null): boolean | undefined {
  if (v == null) return undefined;
  const t = v.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(t)) return true;
  if (["0", "false", "no", "off"].includes(t)) return false;
  return undefined;
}
function optStr(v: string | null): string | undefined {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  const l = t.toLowerCase();
  if (l === "any" || l === "all" || l === "*") return undefined;
  return t;
}
function hasNumeric(val: string | null | undefined) {
  if (val == null) return false;
  const t = val.trim();
  if (!t) return false;
  return Number.isFinite(Number(t));
}
type SortKey = "newest" | "price_asc" | "price_desc" | "featured";
function toSort(v: string | null): SortKey {
  const t = (v || "").trim().toLowerCase();
  if (t === "price_asc" || t === "price-asc") return "price_asc";
  if (t === "price_desc" || t === "price-desc") return "price_desc";
  if (t === "featured") return "featured";
  return "newest";
}

/** SELECT only what cards need (keeps JSON light). Avoid big nested includes. */
const productListSelect = {
  id: true,
  name: true,
  category: true,
  subcategory: true,
  brand: true,
  condition: true,
  price: true,
  image: true,
  gallery: true, // ✅ always include gallery
  location: true,
  negotiable: true,
  createdAt: true,
  featured: true,
  sellerId: true,

  // flattened seller snapshot
  sellerName: true,
  sellerLocation: true,
  sellerMemberSince: true,
  sellerRating: true,
  sellerSales: true,

  seller: {
    select: { id: true, username: true, name: true, image: true, subscription: true },
  },
} as const;

/* ---------------- seller/account badge helpers ---------------- */
type SellerBadgesObj = { verified: boolean | null; tier: FeaturedTier | null };

type SellerBadgePayload = {
  sellerVerified: boolean | null;
  sellerFeaturedTier: FeaturedTier | null;
  sellerBadges: SellerBadgesObj;
  [k: string]: unknown;
};

function toNullableBool(v: unknown): boolean | null {
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

function toNullableTier(v: unknown): FeaturedTier | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (t === "basic" || t === "gold" || t === "diamond") return t as FeaturedTier;
  return null;
}

/**
 * Canonical badge shaper (single source of truth):
 * - never forces defaults when unknown (nulls stay null)
 * - aligns aliases with sellerBadges (no dropping tier into nested-only shape)
 * - keeps canonical keys aligned with detail endpoints
 */
function canonicalizeSellerBadges(raw: any): SellerBadgePayload {
  const rawBadges =
    raw?.sellerBadges && typeof raw.sellerBadges === "object" && !Array.isArray(raw.sellerBadges)
      ? (raw.sellerBadges as any)
      : null;

  const verifiedPrimary = toNullableBool(raw?.sellerVerified);
  const verifiedFallback = rawBadges ? toNullableBool(rawBadges.verified) : null;
  const sellerVerified = verifiedPrimary !== null ? verifiedPrimary : verifiedFallback;

  const tierPrimary = toNullableTier(raw?.sellerFeaturedTier);
  const tierFallback = rawBadges ? toNullableTier(rawBadges.tier) : null;
  const sellerFeaturedTier = tierPrimary ?? tierFallback;

  let base: any = {};
  try {
    base = (buildSellerBadgeFields(sellerVerified, sellerFeaturedTier) as any) ?? {};
  } catch {
    base = {};
  }

  // Enforce canonical keys (prevent "nested-only" tier/verified from being dropped)
  base.sellerVerified = sellerVerified;
  base.sellerFeaturedTier = sellerFeaturedTier;
  base.sellerBadges = { verified: sellerVerified, tier: sellerFeaturedTier } satisfies SellerBadgesObj;

  return base as SellerBadgePayload;
}

async function fetchSellerBadgeMap(ids: string[]) {
  const out = new Map<string, SellerBadgePayload>();
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (!uniq.length) return out;

  try {
    const rows = (await prisma.$queryRaw<{ id: string; u: any }[]>`
      SELECT u.id, row_to_json(u) as u
      FROM "User" u
      WHERE u.id IN (${Prisma.join(uniq)})
    `) as { id: string; u: any }[];

    for (const r of rows) {
      const id = String((r as any)?.id ?? "");
      if (!id) continue;
      const u = (r as any)?.u ?? null;

      // ✅ emailVerified-only resolution happens inside resolver
      const resolved = resolveSellerBadgeFieldsFromUserLike(u);
      out.set(id, canonicalizeSellerBadges(resolved));
    }
  } catch {
    // ignore: caller will emit canonical nulls (no forced defaults)
  }

  return out;
}

/* ----------------------------- safety caps ------------------------------ */
const MAX_PAGE_SIZE = 48;
const DEFAULT_PAGE_SIZE = 24;
const MAX_RESULT_WINDOW = 10_000;
const FACETS_TOP_N = 6;

type PriceClause = { gte?: number; lte?: number };

/* ------------------------- GET /api/products ------------------------- */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    if (process.env.NODE_ENV !== "production") {
      console.log("[/api/products GET]", PRODUCTS_VER, url.toString());
    }

    // Clamp q to avoid expensive scans on huge strings
    const rawQ = (url.searchParams.get("q") || "").trim().slice(0, 64);
    const tokens = rawQ
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 1)
      .slice(0, 5);

    const category = optStr(url.searchParams.get("category"));
    const subcategory = optStr(url.searchParams.get("subcategory"));
    const brand = optStr(url.searchParams.get("brand"));
    const condition = optStr(url.searchParams.get("condition"));

    // owner filters
    const mine = toBool(url.searchParams.get("mine")) === true;
    let sellerId = optStr(url.searchParams.get("sellerId")) || optStr(url.searchParams.get("userId"));
    const sellerUsername = optStr(url.searchParams.get("seller")) || optStr(url.searchParams.get("user"));

    if (mine) {
      const session = await auth().catch(() => null);
      const uid = (session as any)?.user?.id as string | undefined;
      if (!uid) {
        const res = jsonPrivate({ error: "Unauthorized" }, { status: 401 });
        attachVersion(res.headers);
        res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
        return res;
      }
      sellerId = uid;
    }

    const featured = toBool(url.searchParams.get("featured"));
    const verifiedOnly = toBool(url.searchParams.get("verifiedOnly"));

    const minPriceStr = url.searchParams.get("minPrice");
    const maxPriceStr = url.searchParams.get("maxPrice");

    const sort = toSort(url.searchParams.get("sort"));
    const wantFacets = (url.searchParams.get("facets") || "").toLowerCase() === "true";
    const includeFav = toBool(url.searchParams.get("includeFav")) === true;

    const cursor = optStr(url.searchParams.get("cursor"));
    const page = toInt(url.searchParams.get("page"), 1, 1, 100000);
    const limitStr = url.searchParams.get("limit");
    const pageSizeStr = url.searchParams.get("pageSize");
    const hasLimit = hasNumeric(limitStr);
    const hasPageSize = hasNumeric(pageSizeStr);
    let pageSize = DEFAULT_PAGE_SIZE;
    if (hasLimit) pageSize = toInt(limitStr!, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    else if (hasPageSize) pageSize = toInt(pageSizeStr!, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

    const statusParam = optStr(url.searchParams.get("status"));
    const where: Record<string, any> = {};
    if (!statusParam || statusParam.toUpperCase() === "ACTIVE") {
      where["status"] = "ACTIVE";
    } else if (statusParam.toUpperCase() !== "ALL") {
      where["status"] = statusParam.toUpperCase();
    }

    const and: any[] = [];

    // ✅ Tokenized AND search (fallback to rawQ)
    if (tokens.length) {
      for (const t of tokens) {
        and.push({
          OR: [
            { name: { contains: t, mode: "insensitive" } },
            { brand: { contains: t, mode: "insensitive" } },
            { category: { contains: t, mode: "insensitive" } },
            { subcategory: { contains: t, mode: "insensitive" } },
            { sellerName: { contains: t, mode: "insensitive" } },
          ],
        });
      }
    } else if (rawQ) {
      and.push({
        OR: [
          { name: { contains: rawQ, mode: "insensitive" } },
          { brand: { contains: rawQ, mode: "insensitive" } },
          { category: { contains: rawQ, mode: "insensitive" } },
          { subcategory: { contains: rawQ, mode: "insensitive" } },
          { sellerName: { contains: rawQ, mode: "insensitive" } },
        ],
      });
    }

    if (category) and.push({ category: { equals: category, mode: "insensitive" } });
    if (subcategory) and.push({ subcategory: { equals: subcategory, mode: "insensitive" } });
    if (brand) and.push({ brand: { contains: brand, mode: "insensitive" } });
    if (condition) and.push({ condition: { equals: condition, mode: "insensitive" } });
    if (sellerId) and.push({ sellerId });
    if (sellerUsername)
      and.push({
        seller: { is: { username: { equals: sellerUsername, mode: "insensitive" } } },
      });

    // ✅ verifiedOnly filters seller verification (emailVerified != null)
    if (verifiedOnly === true) {
      and.push({ seller: { is: { emailVerified: { not: null } } } });
    }
    if (typeof featured === "boolean" && verifiedOnly !== true) {
      and.push({ featured });
    }

    if (minPriceStr !== null || maxPriceStr !== null) {
      const minPrice = minPriceStr !== null ? toInt(minPriceStr, 0, 0, 9_999_999) : undefined;
      const maxPrice =
        maxPriceStr !== null ? toInt(maxPriceStr, 9_999_999, 0, 9_999_999) : undefined;

      const priceClause: PriceClause = {};
      if (typeof minPrice === "number") priceClause.gte = minPrice;
      if (typeof maxPrice === "number") priceClause.lte = maxPrice;

      const includeNulls = !minPrice || minPrice === 0;
      if (includeNulls) {
        and.push({ OR: [{ price: null }, { price: priceClause }] });
      } else {
        and.push({ price: priceClause });
      }
    }

    if (sort === "price_asc" || sort === "price_desc") {
      and.push({ price: { not: null } });
    }

    if (and.length) where["AND"] = and;

    const isSearchLike = tokens.length > 0 || !!rawQ || !!category || !!subcategory || !!brand;

    let orderBy: any;
    if (sort === "price_asc") {
      orderBy = [{ price: "asc" }, { createdAt: "desc" }, { id: "desc" }];
    } else if (sort === "price_desc") {
      orderBy = [{ price: "desc" }, { createdAt: "desc" }, { id: "desc" }];
    } else if (sort === "featured") {
      orderBy = [{ featured: "desc" }, { createdAt: "asc" }, { id: "desc" }];
    } else {
      orderBy = isSearchLike
        ? [{ featured: "desc" }, { createdAt: "desc" }, { id: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }];
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[/api/products WHERE]", safe(where));
      console.log("[/api/products ORDER]", safe(orderBy));
      console.log("[/api/products page/pageSize]", page, pageSize, "cursor:", cursor ?? null);
    }

    // If client wants favorite flags/counts, try to resolve user (best-effort)
    let userId: string | null = null;
    if (includeFav) {
      try {
        const session = await auth();
        const sId = (session?.user as any)?.id as string | undefined;
        userId = sId ?? null;
        if (!userId && session?.user?.email) {
          const u = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { id: true },
          });
          userId = u?.id ?? null;
        }
      } catch {
        /* ignore auth errors */
      }
    }

    const select: any = { ...productListSelect };
    select._count = { select: { favorites: true } };
    if (userId) {
      select.favorites = { where: { userId }, select: { productId: true }, take: 1 };
    }

    // Guard result window (skip if using cursor)
    if (!cursor) {
      const skipEst = (page - 1) * pageSize;
      if (skipEst > MAX_RESULT_WINDOW) {
        const res = jsonPublic(
          {
            page,
            pageSize,
            total: 0,
            totalPages: 1,
            sort,
            items: [],
            facets: wantFacets ? { categories: [], brands: [], conditions: [] } : undefined,
            nextCursor: null,
            hasMore: false,
          },
          60,
        );
        attachVersion(res.headers);
        res.headers.set("X-Total-Count", "0");
        res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
        return res;
      }
    }

    const listArgs: any = {
      where,
      orderBy,
      take: pageSize + 1,
    };
    if (cursor) {
      listArgs.cursor = { id: cursor };
      listArgs.skip = 1;
    } else {
      listArgs.skip = (page - 1) * pageSize;
    }

    // ------------ heavy work (soft timeout) ------------
    const fastEmpty = () => {
      const r = jsonPublic(
        {
          page,
          pageSize,
          total: 0,
          totalPages: 1,
          sort,
          items: [] as any[],
          facets: wantFacets ? { categories: [], brands: [], conditions: [] } : undefined,
          nextCursor: null,
          hasMore: false,
        },
        30,
      );
      attachVersion(r.headers);
      r.headers.set("X-Total-Count", "0");
      r.headers.set("X-Timeout", "1");
      r.headers.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
      return r;
    };

    const response = await softTimeout(async () => {
      const [total, productsRaw, facets] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({ ...listArgs, select }),
        wantFacets && !cursor && page === 1 ? computeFacets(where) : Promise.resolve(undefined),
      ]);

      const hasMore = (productsRaw as unknown[]).length > pageSize;
      const data = hasMore
        ? (productsRaw as unknown[]).slice(0, pageSize)
        : (productsRaw as unknown[]);
      const nextCursor = hasMore && data.length ? (data[data.length - 1] as any).id : null;

      const sellerIds = Array.from(
        new Set(
          (data as any[])
            .map((p: any) => (p?.sellerId ? String(p.sellerId) : ""))
            .filter(Boolean),
        ),
      );
      const badgeMap = await fetchSellerBadgeMap(sellerIds);

      const items = data.map((p: any) => {
        const favoritesCount: number = p?._count?.favorites ?? 0;
        const rel = p?.favorites;
        const isFavoritedByMe: boolean = Array.isArray(rel) && rel.length > 0;

        const gallery: string[] = Array.isArray(p?.gallery) ? p.gallery.filter(Boolean) : [];
        const image: string | null = p?.image ?? (gallery[0] ?? null);

        const createdAt =
          p?.createdAt instanceof Date ? p.createdAt.toISOString() : String(p?.createdAt ?? "");

        const sellerObj = p?.seller as any;
        const sellerUsername = sellerObj?.username ?? null;

        const sid = p?.sellerId ? String(p.sellerId) : "";
        const resolvedBadges = sid ? badgeMap.get(sid) : undefined;

        // ✅ canonical badge shape; no forced defaults when unknown
        const badges = resolvedBadges ?? canonicalizeSellerBadges(null);

        const { _count, favorites, seller, ...rest } = p;
        return {
          ...rest,
          image,
          gallery,
          // mirrors detail routes for UI merges
          imageUrls: gallery,
          images: gallery,
          photos: gallery,
          createdAt,
          favoritesCount,
          isFavoritedByMe: !!userId && isFavoritedByMe,
          sellerUsername,
          ...badges,
        };
      });

      const payload = {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / Math.max(1, pageSize))),
        sort,
        items,
        facets,
        nextCursor,
        hasMore,
      };

      const res = userId ? jsonPrivate(payload) : jsonPublic(payload, 60);
      attachVersion(res.headers);
      res.headers.set("X-Total-Count", String(total));
      res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
      return res;
    }, DB_TIMEOUT_MS, fastEmpty);

    return response;
  } catch (e: any) {
    console.warn("[/api/products GET] ERROR:", e?.message, e);
    const res = jsonPrivate({ error: "Server error" }, { status: 500 });
    attachVersion(res.headers);
    res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
    return res;
  }
}

/* ------------------------- POST /api/products ------------------------- */
export async function POST(req: NextRequest) {
  const { POST: createProduct } = await import("./create/route");
  return createProduct(req);
}

/* ------------------------------ facets -------------------------------- */
type CatRow = { category: string | null; _count: { _all: number } };
type BrandRow = { brand: string | null; _count: { _all: number } };
type CondRow = { condition: string | null; _count: { _all: number } };

function coalesceCaseInsensitive<T>(
  rows: T[],
  pick: (r: T) => string | null,
): Array<{ value: string; count: number }> {
  const map = new Map<string, { value: string; count: number }>();
  for (const r of rows) {
    const raw = pick(r);
    if (!raw) continue;
    const display = String(raw).trim();
    if (!display) continue;
    const key = display.toLowerCase();
    const prev = map.get(key);
    if (prev) prev.count += (r as any)._count._all || 0;
    else map.set(key, { value: display, count: (r as any)._count._all || 0 });
  }
  return [...map.values()]
     .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
     .slice(0, FACETS_TOP_N);
}

async function computeFacets(where: any) {
  try {
    const [catsRaw, brandsRaw, condsRaw] = await Promise.all([
      prisma.product.groupBy({ by: ["category"], where, _count: { _all: true } }),
      prisma.product.groupBy({ by: ["brand"], where, _count: { _all: true } }),
      prisma.product.groupBy({ by: ["condition"], where, _count: { _all: true } }),
    ]);

    const categories = coalesceCaseInsensitive<CatRow>(catsRaw as CatRow[], (x) => x.category);
    const brands = coalesceCaseInsensitive<BrandRow>(brandsRaw as BrandRow[], (x) => x.brand);
    const conditions = coalesceCaseInsensitive<CondRow>(condsRaw as CondRow[], (x) => x.condition);

    return { categories, brands, conditions };
  } catch {
    return undefined;
  }
}

/* ----------------------------- misc verbs ----------------------------- */
function baseHeaders() {
  const h = new Headers();
  attachVersion(h);
  h.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
  return h;
}

export async function HEAD() {
  const h = baseHeaders();
  h.set("Allow", "GET, POST, HEAD, OPTIONS");
  h.set("Cache-Control", "no-store, no-cache, must-revalidate");
  h.set("Pragma", "no-cache");
  h.set("Expires", "0");
  return new Response(null, { status: 204, headers: h });
}

export async function OPTIONS() {
  const h = baseHeaders();
  const origin = process.env["NEXT_PUBLIC_APP_URL"] ?? process.env["APP_ORIGIN"] ?? "*";
  h.set("Allow", "GET, POST, HEAD, OPTIONS");
  h.set("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Allow-Origin", origin);
  h.set("Access-Control-Max-Age", "86400");
  h.set("Cache-Control", "no-store");
  return new Response(null, { status: 204, headers: h });
}
