export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

/** minimal select for cards */
const serviceListSelect = {
  id: true,
  name: true,
  category: true,
  subcategory: true,
  price: true,
  image: true,
  location: true,
  featured: true,
  createdAt: true,
  sellerId: true,
  seller: {
    select: { id: true, username: true, name: true, image: true, subscription: true },
  },
} as const;

/* -------------------------- GET /api/services -------------------------- */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const q = (url.searchParams.get("q") || "").trim();
    const category = optStr(url.searchParams.get("category"));
    const subcategory = optStr(url.searchParams.get("subcategory"));
    const sellerId = optStr(url.searchParams.get("sellerId")) || optStr(url.searchParams.get("userId"));
    const sellerUsername = optStr(url.searchParams.get("seller")) || optStr(url.searchParams.get("user"));
    const featured = toBool(url.searchParams.get("featured"));
    const minPrice = toInt(url.searchParams.get("minPrice"), NaN, 0, 9_999_999);
    const maxPrice = toInt(url.searchParams.get("maxPrice"), NaN, 0, 9_999_999);

    const sort = toSort(url.searchParams.get("sort"));
    const wantFacets = (url.searchParams.get("facets") || "").toLowerCase() === "true";
    const page = toInt(url.searchParams.get("page"), 1, 1, 100000);
    const pageSize = toInt(url.searchParams.get("pageSize"), 24, 1, 200);

    const where: any = { status: "ACTIVE" };
    const and: any[] = [];

    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
          { subcategory: { contains: q, mode: "insensitive" } },
          { seller: { is: { name: { contains: q, mode: "insensitive" } } } },
        ],
      });
    }
    if (category) and.push({ category: { equals: category, mode: "insensitive" } });
    if (subcategory) and.push({ subcategory: { equals: subcategory, mode: "insensitive" } });
    if (sellerId) and.push({ sellerId });
    if (sellerUsername) and.push({ seller: { is: { username: { equals: sellerUsername, mode: "insensitive" } } } });
    if (typeof featured === "boolean") and.push({ featured });

    if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
      const price: any = {};
      if (Number.isFinite(minPrice)) price.gte = minPrice;
      if (Number.isFinite(maxPrice)) price.lte = maxPrice;
      and.push({ price });
    }
    if (and.length) where.AND = and;

    const isSearchLike = q.length > 0 || !!category || !!subcategory;
    let orderBy: any;
    if (sort === "price_asc") orderBy = { price: "asc" as const };
    else if (sort === "price_desc") orderBy = { price: "desc" as const };
    else if (sort === "featured") orderBy = [{ featured: "desc" as const }, { createdAt: "desc" as const }];
    else orderBy = isSearchLike ? [{ featured: "desc" as const }, { createdAt: "desc" as const }] : { createdAt: "desc" as const };

    const session = await auth().catch(() => null);
    void session;

    const [total, servicesRaw, facets] = await Promise.all([
      prisma.service.count({ where }),
      prisma.service.findMany({
        where,
        select: serviceListSelect,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      wantFacets && page === 1 ? computeFacets(where) : Promise.resolve(undefined),
    ]);

    const items = (servicesRaw as Array<any>).map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      subcategory: s.subcategory,
      price: s.price,
      image: s.image ?? null,
      featured: s.featured,
      location: s.location,
      createdAt: s?.createdAt instanceof Date ? s.createdAt.toISOString() : String(s?.createdAt ?? ""),
    }));

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
    console.warn("[/api/services GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* -------------------------- POST /api/services ------------------------- */
export async function POST(req: NextRequest) {
  const { POST: createService } = await import("./create/route");
  return createService(req);
}

/* ------------------------------ facets -------------------------------- */
type CatRow = { category: string | null; _count: { _all: number } };
type SubcatRow = { subcategory: string | null; _count: { _all: number } };

async function computeFacets(where: any) {
  try {
    const [catsRaw, subsRaw] = await Promise.all([
      prisma.service.groupBy({ by: ["category"], where, _count: { _all: true } }),
      prisma.service.groupBy({ by: ["subcategory"], where, _count: { _all: true } }),
    ]);

    const categories = (catsRaw as CatRow[])
      .filter((x) => !!x.category)
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 10)
      .map((x) => ({ value: String(x.category), count: x._count._all }));

    const subcategories = (subsRaw as SubcatRow[])
      .filter((x) => !!x.subcategory)
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 10)
      .map((x) => ({ value: String(x.subcategory), count: x._count._all }));

    return { categories, subcategories };
  } catch {
    return undefined;
  }
}
