// src/app/api/products/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@prisma/client";

const clampInt = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const noStore = <T>(body: T, init?: ResponseInit) => {
  const res = NextResponse.json(body as any, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
};

const parseNumOrNull = (v: string | null): number | null => {
  if (!v || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function buildWhere(opts: {
  q?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  condition?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
  verifiedOnly?: boolean;
  includeCategory?: boolean;
  includeBrand?: boolean;
  includeCondition?: boolean;
}): Prisma.ProductWhereInput {
  const {
    q,
    category,
    subcategory,
    brand,
    condition,
    minPrice,
    maxPrice,
    verifiedOnly,
    includeCategory = true,
    includeBrand = true,
    includeCondition = true,
  } = opts;

  const AND: Prisma.ProductWhereInput[] = [];

  if (q) {
    AND.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { subcategory: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (includeCategory && category) AND.push({ category });
  if (subcategory) AND.push({ subcategory });
  if (includeBrand && brand) AND.push({ brand });
  if (includeCondition && condition) AND.push({ condition });

  // price range – only add when parsed numbers are valid
  if (minPrice != null || maxPrice != null) {
    const price: Prisma.IntNullableFilter = { not: null };
    if (minPrice != null) price.gte = Math.max(0, Math.floor(minPrice));
    if (maxPrice != null) price.lte = Math.max(0, Math.floor(maxPrice));
    AND.push({ price });
  }

  if (verifiedOnly) {
    // Treat "verified" as featured. If you prefer, switch to { sellerId: { not: null } }
    AND.push({ featured: true });
  }

  return AND.length ? { AND } : {};
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;

    const q = sp.get("q") || undefined;
    const category = sp.get("category") || undefined;
    const subcategory = sp.get("subcategory") || undefined;
    const brand = sp.get("brand") || undefined;
    const condition = sp.get("condition") || undefined;

    // Safe numeric parsing (avoid NaN → Prisma validation errors)
    const minPrice = parseNumOrNull(sp.get("minPrice"));
    const maxPrice = parseNumOrNull(sp.get("maxPrice"));

    const verifiedOnly = sp.get("verifiedOnly") === "true";
    const sort = (sp.get("sort") || "top") as
      | "top"
      | "new"
      | "price_asc"
      | "price_desc";

    const page = clampInt(parseInt(sp.get("page") || "1", 10) || 1, 1, 10_000);
    const pageSize = clampInt(
      parseInt(sp.get("pageSize") || "24", 10) || 24,
      12,
      60
    );
    const wantFacets = sp.get("facets") === "true";

    const where = buildWhere({
      q,
      category,
      subcategory,
      brand,
      condition,
      minPrice,
      maxPrice,
      verifiedOnly,
      includeCategory: true,
      includeBrand: true,
      includeCondition: true,
    });

    const orderBy: Prisma.ProductOrderByWithRelationInput[] = (() => {
      switch (sort) {
        case "new":
          return [{ createdAt: "desc" }];
        case "price_asc":
          // Note: nulls will sort first by default in Prisma; change your where() if you want to exclude null prices.
          return [{ price: "asc" }, { createdAt: "desc" }];
        case "price_desc":
          return [{ price: "desc" }, { createdAt: "desc" }];
        case "top":
        default:
          return [{ featured: "desc" }, { createdAt: "desc" }];
      }
    })();

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [total, items] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          name: true,
          category: true,
          subcategory: true,
          brand: true,
          condition: true,
          price: true,
          image: true,
          featured: true,
          location: true,
          createdAt: true,
        },
      }),
    ]);

    // ----- Disjunctive facets (computed only on first page when requested) -----
    let facets:
      | {
          categories?: { value: string; count: number }[];
          brands?: { value: string; count: number }[];
          conditions?: { value: string; count: number }[];
        }
      | undefined;

    const topN = <T extends { value: string; count: number }>(arr: T[]) =>
      arr.sort((a, b) => b.count - a.count).slice(0, 12);

    if (wantFacets && page === 1) {
      const [gbCat, gbBrand, gbCond] = await Promise.all([
        prisma.product.groupBy({
          by: ["category"],
          where: buildWhere({
            q,
            category,
            subcategory,
            brand,
            condition,
            minPrice,
            maxPrice,
            verifiedOnly,
            includeCategory: false, // exclude its own filter
            includeBrand: true,
            includeCondition: true,
          }),
          _count: { _all: true },
        }),
        prisma.product.groupBy({
          by: ["brand"],
          where: buildWhere({
            q,
            category,
            subcategory,
            brand,
            condition,
            minPrice,
            maxPrice,
            verifiedOnly,
            includeCategory: true,
            includeBrand: false, // exclude its own filter
            includeCondition: true,
          }),
          _count: { _all: true },
        }),
        prisma.product.groupBy({
          by: ["condition"],
          where: buildWhere({
            q,
            category,
            subcategory,
            brand,
            condition,
            minPrice,
            maxPrice,
            verifiedOnly,
            includeCategory: true,
            includeBrand: true,
            includeCondition: false, // exclude its own filter
          }),
          _count: { _all: true },
        }),
      ]);

      facets = {
        categories: topN(
          gbCat
            .filter((r) => r.category)
            .map((r) => ({ value: r.category as string, count: r._count._all }))
        ),
        brands: topN(
          gbBrand
            .filter((r) => r.brand)
            .map((r) => ({ value: r.brand as string, count: r._count._all }))
        ),
        conditions: topN(
          gbCond
            .filter((r) => r.condition)
            .map((r) => ({
              value: r.condition as string,
              count: r._count._all,
            }))
        ),
      };
    }
    // --------------------------------------------------------------------------

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return noStore({
      mode: "page",
      page,
      pageSize,
      total,
      totalPages,
      items,
      ...(facets ? { facets } : {}),
    });
  } catch (e: any) {
    console.error("[/api/products] error:", e);
    const msg =
      e?.code === "P1001"
        ? "Database is not reachable. Check DATABASE_URL/DIRECT_URL and network."
        : e?.message || "Unexpected error";
    return noStore({ error: msg }, { status: 500 });
  }
}

// Optional quick probe
export async function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
