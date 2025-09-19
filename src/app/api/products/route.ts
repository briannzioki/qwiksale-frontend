// src/app/api/products/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

/* ----------------------------- tiny helpers ----------------------------- */
function noStore(jsonOrRes: unknown, init?: ResponseInit): NextResponse {
  const res =
    jsonOrRes instanceof NextResponse
      ? jsonOrRes
      : NextResponse.json(jsonOrRes as any, init);
  // never cache: this can personalize based on auth/cookies
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Cookie, Authorization, Accept-Encoding");
  return res;
}

function toInt(v: string | null, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
function toBool(v: string | null): boolean | undefined {
  if (v == null) return undefined;
  const t = v.trim().toLowerCase();
  if (["1", "true", "yes"].includes(t)) return true;
  if (["0", "false", "no"].includes(t)) return false;
  return undefined;
}
function optStr(v: string | null): string | undefined {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  const l = t.toLowerCase();
  if (l === "any" || l === "all" || l === "*") return undefined;
  return t;
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
  image: true, // thumbnail/single cover URL if you have it
  location: true,
  negotiable: true,
  createdAt: true,
  featured: true,
  sellerId: true,

  // flattened seller snapshot (columns on Product)
  sellerName: true,
  sellerLocation: true,
  sellerMemberSince: true,
  sellerRating: true,
  sellerSales: true,

  // tiny seller relation (for avatar/username)
  seller: {
    select: { id: true, username: true, name: true, image: true, subscription: true },
  },
} as const;

/* ----------------------------- safety caps ------------------------------ */
const MAX_PAGE_SIZE = 48;          // never allow more than this per request
const DEFAULT_PAGE_SIZE = 24;
const MAX_RESULT_WINDOW = 10_000;  // max records we’ll allow skipping with page/skip

/* ------------------------- GET /api/products ------------------------- */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const q = (url.searchParams.get("q") || "").trim();
    const category = optStr(url.searchParams.get("category"));
    const subcategory = optStr(url.searchParams.get("subcategory"));
    const brand = optStr(url.searchParams.get("brand"));
    const condition = optStr(url.searchParams.get("condition"));
    const sellerId = optStr(url.searchParams.get("sellerId"));
    const sellerUsername = optStr(url.searchParams.get("seller"));

    const featured = toBool(url.searchParams.get("featured"));
    const verifiedOnly = toBool(url.searchParams.get("verifiedOnly"));

    const minPrice = toInt(url.searchParams.get("minPrice"), NaN, 0, 9_999_999);
    const maxPrice = toInt(url.searchParams.get("maxPrice"), NaN, 0, 9_999_999);

    const sort = toSort(url.searchParams.get("sort"));
    const wantFacets = (url.searchParams.get("facets") || "").toLowerCase() === "true";

    // pagination (supports cursor OR page/skip; cursor wins if provided)
    const cursor = optStr(url.searchParams.get("cursor"));
    const page = toInt(url.searchParams.get("page"), 1, 1, 100000);
    const pageSize = toInt(url.searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

    const where: Record<string, any> = { status: "ACTIVE" };
    const and: any[] = [];

    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { brand: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
          { subcategory: { contains: q, mode: "insensitive" } },
          { sellerName: { contains: q, mode: "insensitive" } },
        ],
      });
    }
    // NOTE: if you truly need case-insensitive equals, Prisma allows `mode` on string filters.
    if (category) and.push({ category: { equals: category, mode: "insensitive" } });
    if (subcategory) and.push({ subcategory: { equals: subcategory, mode: "insensitive" } });
    if (brand) and.push({ brand: { contains: brand, mode: "insensitive" } });
    if (condition) and.push({ condition: { equals: condition, mode: "insensitive" } });
    if (sellerId) and.push({ sellerId });
    if (sellerUsername)
      and.push({ seller: { is: { username: { equals: sellerUsername, mode: "insensitive" } } } });
    if (typeof featured === "boolean") and.push({ featured });
    if (verifiedOnly === true) and.push({ featured: true });

    if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
      const price: any = {};
      if (Number.isFinite(minPrice)) price.gte = minPrice;
      if (Number.isFinite(maxPrice)) price.lte = maxPrice;
      and.push({ price });
    }
    if (and.length) where["AND"] = and;

    const isSearchLike = q.length > 0 || !!category || !!subcategory || !!brand;

    // Default sort -> tie-break on id for stable ordering
    let orderBy: any;
    if (sort === "price_asc") orderBy = [{ price: "asc" as const }, { id: "desc" as const }];
    else if (sort === "price_desc") orderBy = [{ price: "desc" as const }, { id: "desc" as const }];
    else if (sort === "featured")
      orderBy = [{ featured: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];
    else
      orderBy = isSearchLike
        ? [{ featured: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }]
        : [{ createdAt: "desc" as const }, { id: "desc" as const }];

    // Resolve current user id (optional, for isFavoritedByMe)
    let userId: string | null = null;
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

    const select: any = { ...productListSelect };
    // counts and per-user favorite flag (lightweight: take 1)
    select._count = { select: { favorites: true } };
    if (userId) {
      select.favorites = { where: { userId }, select: { productId: true }, take: 1 };
    }

    // Guard result window if using page/skip (to avoid huge DB offsets)
    if (!cursor) {
      const skipEst = (page - 1) * pageSize;
      if (skipEst > MAX_RESULT_WINDOW) {
        return noStore({
          page,
          pageSize,
          total: 0,
          totalPages: 0,
          sort,
          items: [],
          facets: wantFacets ? { categories: [], brands: [], conditions: [] } : undefined,
          nextCursor: null,
          hasMore: false,
        });
      }
    }

    // Build the findMany() args (cursor wins; otherwise skip/page)
    const listArgs: any = {
      where,
      select,
      orderBy,
      take: pageSize + 1, // fetch +1 to know if there’s a next page
    };
    if (cursor) {
      listArgs.cursor = { id: cursor };
      listArgs.skip = 1;
    } else {
      listArgs.skip = (page - 1) * pageSize;
    }

    const [total, productsRaw, facets] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany(listArgs),
      // only compute facets when explicitly requested AND first page (keeps DB/heap light)
      wantFacets && !cursor && page === 1 ? computeFacets(where) : Promise.resolve(undefined),
    ]);

    const hasMore = (productsRaw as unknown[]).length > pageSize;
    const data = hasMore ? (productsRaw as unknown[]).slice(0, pageSize) : (productsRaw as unknown[]);
    const last = data[data.length - 1] as any | undefined;
    const nextCursor = hasMore ? (last?.id ?? null) : null;

    // map to response shape + small numbers/strings only
    const items = (data as Array<any>).map((p) => {
      const favoritesCount: number = p?._count?.favorites ?? 0;
      const rel = (p as any)?.favorites;
      const isFavoritedByMe: boolean = Array.isArray(rel) && rel.length > 0;
      const createdAt =
        p?.createdAt instanceof Date ? p.createdAt.toISOString() : String(p?.createdAt ?? "");
      const { _count, favorites, ...rest } = p;
      return { ...rest, createdAt, favoritesCount, isFavoritedByMe };
    });

    const res = noStore({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      sort,
      items,
      facets,
      nextCursor,
      hasMore,
    });
    res.headers.set("X-Total-Count", String(total));
    return res;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/products GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
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

async function computeFacets(where: any) {
  try {
    const [catsRaw, brandsRaw, condsRaw] = await Promise.all([
      prisma.product.groupBy({ by: ["category"], where, _count: { _all: true } }),
      prisma.product.groupBy({ by: ["brand"], where, _count: { _all: true } }),
      prisma.product.groupBy({ by: ["condition"], where, _count: { _all: true } }),
    ]);

    const byCountDesc = (a: { _count: { _all: number } }, b: { _count: { _all: number } }) =>
      b._count._all - a._count._all;

    const categories = (catsRaw as CatRow[])
      .filter((x) => !!x.category)
      .sort(byCountDesc)
      .slice(0, 10)
      .map((x) => ({ value: String(x.category), count: x._count._all }));

    const brands = (brandsRaw as BrandRow[])
      .filter((x) => !!x.brand)
      .sort(byCountDesc)
      .slice(0, 10)
      .map((x) => ({ value: String(x.brand), count: x._count._all }));

    const conditions = (condsRaw as CondRow[])
      .filter((x) => !!x.condition)
      .sort(byCountDesc)
      .slice(0, 10)
      .map((x) => ({ value: String(x.condition), count: x._count._all }));

    return { categories, brands, conditions };
  } catch {
    return undefined;
  }
}

/* ----------------------------- misc verbs ----------------------------- */
export async function HEAD() {
  return noStore(new NextResponse(null, { status: 204 }));
}

export async function OPTIONS() {
  return noStore({ ok: true }, { status: 200 });
}
