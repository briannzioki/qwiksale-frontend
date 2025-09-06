// src/app/api/products/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

/* ----------------------------- tiny helpers ----------------------------- */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
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

// normalize string params: treat "", "any", "all", "*" as undefined
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

/** select for list cards (lightweight) */
const productListSelect = {
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

  // flattened seller snapshot
  sellerName: true,
  sellerLocation: true,
  sellerMemberSince: true,
  sellerRating: true,
  sellerSales: true,

  // light linked seller info (includes username for store links)
  seller: {
    select: { id: true, username: true, name: true, image: true, subscription: true },
  },
} as const;

/** email of the demo/seed user we want to hide by default (set in Vercel env) */
const DEMO_EMAIL =
  process.env["SEED_DEMO_USER_EMAIL"] ||
  process.env["DEMO_SELLER_EMAIL"] ||
  "";

/* ------------------------- GET /api/products ------------------------- */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    // text query
    const q = (url.searchParams.get("q") || "").trim();

    // optional filters (ignore "any"/"*"/"")
    const category = optStr(url.searchParams.get("category"));
    const subcategory = optStr(url.searchParams.get("subcategory"));
    const brand = optStr(url.searchParams.get("brand"));
    const condition = optStr(url.searchParams.get("condition"));
    const sellerId = optStr(url.searchParams.get("sellerId"));
    const sellerUsername = optStr(url.searchParams.get("seller")); // username

    // featured / verifiedOnly
    const featured = toBool(url.searchParams.get("featured"));
    const verifiedOnly = toBool(url.searchParams.get("verifiedOnly")); // alias

    // price range
    const minPrice = toInt(url.searchParams.get("minPrice"), NaN, 0, 9_999_999);
    const maxPrice = toInt(url.searchParams.get("maxPrice"), NaN, 0, 9_999_999);

    // sorting & pagination
    const sort = toSort(url.searchParams.get("sort"));
    const wantFacets = (url.searchParams.get("facets") || "").toLowerCase() === "true";
    const page = toInt(url.searchParams.get("page"), 1, 1, 100000);
    const pageSize = toInt(url.searchParams.get("pageSize"), 60, 1, 200);

    // flags controlling demo visibility & search-like detection
    const includeDemo = toBool(url.searchParams.get("includeDemo")) === true;
    const isSearchLike = q.length > 0 || !!category || !!subcategory || !!brand;

    // Build where (default to ACTIVE items)
    const where: any = { status: "ACTIVE" };
    const and: any[] = [];

    if (q.length > 0) {
      and.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { brand: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
          { subcategory: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      });
    }
    if (category) and.push({ category: { equals: category, mode: "insensitive" } });
    if (subcategory) and.push({ subcategory: { equals: subcategory, mode: "insensitive" } });
    if (brand) and.push({ brand: { contains: brand, mode: "insensitive" } });
    if (condition) and.push({ condition: { equals: condition, mode: "insensitive" } });
    if (sellerId) and.push({ sellerId });
    if (sellerUsername) {
      and.push({ seller: { is: { username: { equals: sellerUsername, mode: "insensitive" } } } });
    }
    if (typeof featured === "boolean") and.push({ featured });
    if (verifiedOnly === true) and.push({ featured: true }); // alias

    if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
      const price: any = {};
      if (Number.isFinite(minPrice)) price.gte = minPrice;
      if (Number.isFinite(maxPrice)) price.lte = maxPrice;
      and.push({ price });
    }

    // Hide demo/seeded data unless explicitly included
    if (!includeDemo) {
      if (DEMO_EMAIL) {
        and.push({
          NOT: { seller: { is: { email: { equals: DEMO_EMAIL, mode: "insensitive" } } } },
        });
      }
      // Filter out obvious seeded clones
      and.push({ NOT: { name: { contains: "• Batch" } } });
    }

    if (and.length > 0) where.AND = and;

    // Sorting
    let orderBy: any;
    if (sort === "price_asc") {
      orderBy = { price: "asc" as const };
    } else if (sort === "price_desc") {
      orderBy = { price: "desc" as const };
    } else if (sort === "featured") {
      orderBy = [{ featured: "desc" as const }, { createdAt: "desc" as const }];
    } else {
      // default: on searches, surface featured first; on home, newest first
      orderBy = isSearchLike
        ? [{ featured: "desc" as const }, { createdAt: "desc" as const }]
        : { createdAt: "desc" as const };
    }

    // Resolve current user id (optional)
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

    // Build Prisma select dynamically to add favorites/_count only when useful
    const select: any = { ...productListSelect };

    // Always compute total favorites via _count
    select._count = { select: { favorites: true } };

    // Only fetch per-user favorites relation when we have a userId
    if (userId) {
      select.favorites = {
        where: { userId },
        select: { productId: true },
        take: 1, // we only need to know if at least one exists
      };
    }

    // Query
    const [total, productsRaw, facets] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        select,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      wantFacets ? computeFacets(where) : Promise.resolve(undefined),
    ]);

    // Shape response: add favoritesCount & isFavoritedByMe, strip helpers
    const items = (productsRaw as unknown as Array<any>).map((p) => {
      const favoritesCount: number = p?._count?.favorites ?? 0;

      // SAFETY: never assume `favorites` exists on the type — check at runtime.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const rel = (p as any)?.favorites;
      const isFavoritedByMe: boolean = Array.isArray(rel) && rel.length > 0;

      const createdAt =
        p?.createdAt instanceof Date ? p.createdAt.toISOString() : String(p?.createdAt ?? "");

      const { _count, favorites, ...rest } = p;
      return {
        ...rest,
        createdAt,
        favoritesCount,
        isFavoritedByMe,
      };
    });

    return noStore({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      sort,
      items,
      facets,
    });
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

    const cats = (catsRaw as CatRow[])
      .filter((x) => !!x.category)
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 10)
      .map((x) => ({ value: String(x.category), count: x._count._all }));

    const brands = (brandsRaw as BrandRow[])
      .filter((x) => !!x.brand)
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 10)
      .map((x) => ({ value: String(x.brand), count: x._count._all }));

    const conditions = (condsRaw as CondRow[])
      .filter((x) => !!x.condition)
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 10)
      .map((x) => ({ value: String(x.condition), count: x._count._all }));

    return { categories: cats, brands, conditions };
  } catch {
    return undefined;
  }
}
