export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // CDN can still cache via s-maxage below.
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { jsonPublic, jsonPrivate } from "@/app/api/_lib/responses";

/* ----------------------------- tiny helpers ----------------------------- */
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
const MAX_PAGE_SIZE = 48;
const DEFAULT_PAGE_SIZE = 24;
const MAX_RESULT_WINDOW = 10_000;

/* ------------------------- GET /api/products ------------------------- */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    // Clamp q to avoid expensive scans on huge strings
    const rawQ = (url.searchParams.get("q") || "").trim();
    const q = rawQ.slice(0, 64);

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
    const includeFav = toBool(url.searchParams.get("includeFav")) === true;

    // pagination
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

    // When sorting by price, exclude null prices for deterministic ordering
    if (sort === "price_asc" || sort === "price_desc") {
      and.push({ price: { not: null } });
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

    // Resolve user only if caller explicitly wants personal favorite flag
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
    // counts always useful and cheap
    select._count = { select: { favorites: true } };
    if (userId) {
      select.favorites = { where: { userId }, select: { productId: true }, take: 1 };
    }

    // Guard result window if using page/skip (to avoid huge DB offsets)
    if (!cursor) {
      const skipEst = (page - 1) * pageSize;
      if (skipEst > MAX_RESULT_WINDOW) {
        const res = jsonPublic(
          {
            page,
            pageSize,
            total: 0,
            totalPages: 0,
            sort,
            items: [],
            facets: wantFacets ? { categories: [], brands: [], conditions: [] } : undefined,
            nextCursor: null,
            hasMore: false,
          },
          60
        );
        res.headers.set("X-Total-Count", "0");
        return res;
      }
    }

    const listArgs: any = {
      where,
      select,
      orderBy,
      take: pageSize + 1,
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
      wantFacets && !cursor && page === 1 ? computeFacets(where) : Promise.resolve(undefined),
    ]);

    const hasMore = (productsRaw as unknown[]).length > pageSize;
    const data = hasMore ? (productsRaw as unknown[]).slice(0, pageSize) : (productsRaw as unknown[]);
    const nextCursor = hasMore && data.length ? (data[data.length - 1] as any).id : null;

    const items = (data as Array<any>).map((p) => {
      const favoritesCount: number = p?._count?.favorites ?? 0;
      const rel = (p as any)?.favorites;
      const isFavoritedByMe: boolean = Array.isArray(rel) && rel.length > 0;
      const createdAt =
        p?.createdAt instanceof Date ? p.createdAt.toISOString() : String(p?.createdAt ?? "");
      const { _count, favorites, ...rest } = p;
      return { ...rest, createdAt, favoritesCount, isFavoritedByMe: !!userId && isFavoritedByMe };
    });

    const payload = {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      sort,
      items,
      facets,
      nextCursor,
      hasMore,
    };

    const res = userId
      ? jsonPrivate(payload) // personalized -> no-store
      : jsonPublic(payload, 60); // public -> cache for 60s

    res.headers.set("X-Total-Count", String(total));
    return res;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/products GET] error:", e);
    return jsonPrivate({ error: "Server error" }, { status: 500 });
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
  pick: (r: T) => string | null
): Array<{ value: string; count: number }> {
  const map = new Map<string, { value: string; count: number }>(); // key = lowercased
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
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 10);
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
export async function HEAD() {
  return jsonPublic(null, 60, { status: 204 });
}

export async function OPTIONS() {
  return jsonPublic({ ok: true }, 60, { status: 200 });
}
