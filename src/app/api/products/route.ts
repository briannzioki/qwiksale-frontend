// src/app/api/products/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@prisma/client";

const clampInt = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

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

  // price range (both nullable)
  if (minPrice != null || maxPrice != null) {
    const price: Prisma.IntNullableFilter = { not: null };
    if (minPrice != null) price.gte = minPrice;
    if (maxPrice != null) price.lte = maxPrice;
    AND.push({ price });
  }

  if (verifiedOnly) {
    // Treat "verified" as featured (or switch to { sellerId: { not: null } })
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

    // safer numeric parsing (no NaN leaks)
    const minPriceRaw = sp.get("minPrice");
    const maxPriceRaw = sp.get("maxPrice");

    const minPrice =
      minPriceRaw && minPriceRaw !== "" ? Math.max(0, Number(minPriceRaw)) : null;
    const maxPrice =
      maxPriceRaw && maxPriceRaw !== "" ? Math.max(0, Number(maxPriceRaw)) : null;

    const verifiedOnly = sp.get("verifiedOnly") === "true";
    const sort = (sp.get("sort") || "top") as "top" | "new" | "price_asc" | "price_desc";

    const page = clampInt(parseInt(sp.get("page") || "1", 10) || 1, 1, 10_000);
    const pageSize = clampInt(parseInt(sp.get("pageSize") || "24", 10) || 24, 12, 60);
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

    // ----- Disjunctive facets (sort in JS; don't order by _count._all in SQL) -----
    type CountAll = { _count: { _all: number } };
    const topN = <T extends { value: string; count: number }>(arr: T[]) =>
      arr.sort((a, b) => b.count - a.count).slice(0, 12);

    let facets:
      | {
          categories?: { value: string; count: number }[];
          brands?: { value: string; count: number }[];
          conditions?: { value: string; count: number }[];
        }
      | undefined;

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
        }) as unknown as Array<{ category: string | null } & CountAll>,

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
        }) as unknown as Array<{ brand: string | null } & CountAll>,

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
        }) as unknown as Array<{ condition: string | null } & CountAll>,
      ]);

      facets = {
        categories: topN(
          gbCat.filter((r) => r.category).map((r) => ({
            value: r.category!,
            count: r._count._all,
          }))
        ),
        brands: topN(
          gbBrand.filter((r) => r.brand).map((r) => ({
            value: r.brand!,
            count: r._count._all,
          }))
        ),
        conditions: topN(
          gbCond.filter((r) => r.condition).map((r) => ({
            value: r.condition!,
            count: r._count._all,
          }))
        ),
      };
    }
    // ------------------------------------------------------------------------

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json(
      {
        mode: "page",
        page,
        pageSize,
        total,
        totalPages,
        items,
        ...(facets ? { facets } : {}),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("[/api/products] error:", e);
    const msg =
      e?.code === "P1001"
        ? "Database is not reachable. Check DATABASE_URL/DIRECT_URL and network."
        : e?.message || "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
