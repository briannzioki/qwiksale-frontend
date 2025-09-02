// src/app/api/products/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

/* ----------------------------- tiny helpers ----------------------------- */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
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

  // light linked seller info (⬅️ includes username now)
  seller: { select: { id: true, username: true, name: true, image: true, subscription: true } },
} as const;

/* ------------------------- GET /api/products ------------------------- */
/**
 * Supported query params:
 * - q               : text search on name/brand/category/subcategory/description
 * - category        : exact match (case-insensitive)
 * - subcategory     : exact match (case-insensitive)
 * - brand           : contains (case-insensitive)
 * - sellerId        : only products by this user id
 * - seller          : only products by this username (case-insensitive)
 * - featured        : true/false
 * - minPrice, maxPrice : numeric KES filters
 * - sort            : newest | price_asc | price_desc | featured  (default: newest)
 * - page, pageSize  : pagination (default: 1, 60)
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const category = (url.searchParams.get("category") || "").trim();
    const subcategory = (url.searchParams.get("subcategory") || "").trim();
    const brand = (url.searchParams.get("brand") || "").trim();
    const sellerId = (url.searchParams.get("sellerId") || "").trim();
    const sellerUsername = (url.searchParams.get("seller") || "").trim(); // ⬅️ new
    const featured = toBool(url.searchParams.get("featured"));
    const minPrice = toInt(url.searchParams.get("minPrice"), NaN, 0, 9_999_999);
    const maxPrice = toInt(url.searchParams.get("maxPrice"), NaN, 0, 9_999_999);
    const sort = toSort(url.searchParams.get("sort"));

    const page = toInt(url.searchParams.get("page"), 1, 1, 100000);
    const pageSize = toInt(url.searchParams.get("pageSize"), 60, 1, 200);

    // Build where
    const where: any = {};
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
    if (category) {
      and.push({ category: { equals: category, mode: "insensitive" } });
    }
    if (subcategory) {
      and.push({ subcategory: { equals: subcategory, mode: "insensitive" } });
    }
    if (brand) {
      and.push({ brand: { contains: brand, mode: "insensitive" } });
    }
    if (sellerId) {
      and.push({ sellerId });
    }
    if (sellerUsername) {
      // filter via relation on username (case-insensitive)
      and.push({ seller: { username: { equals: sellerUsername, mode: "insensitive" } } });
    }
    if (typeof featured === "boolean") {
      and.push({ featured });
    }
    if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
      const price: any = {};
      if (Number.isFinite(minPrice)) price.gte = minPrice;
      if (Number.isFinite(maxPrice)) price.lte = maxPrice;
      and.push({ price });
    }
    if (and.length > 0) where.AND = and;

    // Sorting
    let orderBy: any = { createdAt: "desc" as const };
    if (sort === "price_asc") orderBy = { price: "asc" as const };
    else if (sort === "price_desc") orderBy = { price: "desc" as const };
    else if (sort === "featured")
      orderBy = [{ featured: "desc" as const }, { createdAt: "desc" as const }];

    // Query
    const [total, items] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        select: productListSelect,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // map dates to ISO to keep JSON stable
    const mapped = items.map((p: any) => ({
      ...p,
      createdAt:
        p?.createdAt instanceof Date ? p.createdAt.toISOString() : String(p?.createdAt ?? ""),
    }));

    return noStore({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      sort,
      items: mapped,
    });
  } catch (e) {
    console.warn("[/api/products GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ------------------------- POST /api/products ------------------------- */
/** Delegate to /api/products/create/route.ts to keep one creator code path. */
export async function POST(req: NextRequest) {
  const { POST: createProduct } = await import("./create/route");
  return createProduct(req);
}
