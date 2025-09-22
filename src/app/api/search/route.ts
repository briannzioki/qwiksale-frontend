// src/app/api/search/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

/**
 * Full-text-ish listing search backed by pg_trgm (similarity) + filters.
 *
 * Supports:
 * - q: query string (trigram similarity + ILIKE fallback)
 * - town, category
 * - minPrice, maxPrice
 * - condition: "all" | "brand new" | "pre-owned"
 * - verifiedOnly: "1" | "true"
 * - sort: "newest" | "price_asc" | "price_desc" | "featured"
 *
 * Pagination:
 * - page (1-based), pageSize (max 50)
 *
 * Facets (respect base filters: town/category/price/condition/verified):
 * - towns, categories, brands, conditions
 *
 * Notes:
 * - Requires pg_trgm extension for `similarity()` to be available.
 * - Uses safe, parameterized SQL (no string interpolation of user inputs).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------- tiny helpers ----------
const toBool = (v: string | null) =>
  v === "1" || v?.toLowerCase() === "true";

const toNum = (v: string | null, d = 0) => {
  const n = Number(v ?? "");
  return Number.isFinite(n) ? n : d;
};

function normQuery(q: string) {
  return q.trim().toLowerCase();
}

// Push param and return its $N placeholder
function ph(params: any[], val: any) {
  params.push(val);
  return `$${params.length}`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const qRaw = searchParams.get("q") ?? "";
    const q = normQuery(qRaw);
    const town = searchParams.get("town") ?? "";
    const category = searchParams.get("category") ?? "";
    const minPrice = searchParams.get("minPrice");
    const maxPrice = searchParams.get("maxPrice");
    const condition = (searchParams.get("condition") ?? "all").toLowerCase(); // "all" | "brand new" | "pre-owned"
    const sort = (searchParams.get("sort") ?? "newest") as
      | "newest"
      | "price_asc"
      | "price_desc"
      | "featured";
    const verifiedOnly = toBool(searchParams.get("verifiedOnly"));

    const page = Math.max(1, toNum(searchParams.get("page"), 1));
    const pageSize = Math.min(50, Math.max(1, toNum(searchParams.get("pageSize"), 20)));
    const offset = (page - 1) * pageSize;

    // Optional synonyms expansion (small set)
    const synonyms: { word: string }[] =
      q.length > 0
        ? await prisma.$queryRaw<{ word: string }[]>`
            SELECT unnest(expands_to) as word
            FROM "Synonym"
            WHERE term = ${q}
          `
        : [];

    // Build base filters (these affect both search + facets)
    const baseParams: any[] = [];
    const baseFilters: string[] = [];

    if (town) baseFilters.push(`"town" = ${ph(baseParams, town)}`);
    if (category) baseFilters.push(`"category" = ${ph(baseParams, category)}`);
    if (verifiedOnly) baseFilters.push(`"featured" = ${ph(baseParams, true)}`);

    const min = minPrice ? Math.max(0, toNum(minPrice)) : null;
    const max = maxPrice ? Math.max(0, toNum(maxPrice)) : null;
    if (min !== null) baseFilters.push(`"price" >= ${ph(baseParams, min)}`);
    if (max !== null) baseFilters.push(`"price" <= ${ph(baseParams, max)}`);

    if (condition === "brand new") baseFilters.push(`LOWER("condition") = ${ph(baseParams, "brand new")}`);
    else if (condition === "pre-owned") baseFilters.push(`LOWER("condition") = ${ph(baseParams, "pre-owned")}`);
    // "all" → no condition filter

    const baseWhere = baseFilters.length ? `WHERE ${baseFilters.join(" AND ")}` : "";

    // Sorting
    const sortSQL =
      sort === "price_asc"
        ? `"price" ASC NULLS LAST, "createdAt" DESC`
        : sort === "price_desc"
        ? `"price" DESC NULLS LAST, "createdAt" DESC`
        : sort === "featured"
        ? `"featured" DESC, "createdAt" DESC`
        : `"createdAt" DESC`;

    // Compose expanded terms VALUES list placeholders for CTE
    const expanded = [q, ...synonyms.map((s: { word: string }) => s.word)];
    const valuesPlaceholders =
      expanded.length > 1
        ? expanded.slice(1).map((_w, i) => `($${i + 2})`).join(",")
        : ""; // no synonyms

    // ILIKE fallback on either title/description if q present
    const likeParams: any[] = [];
    const likePh = q ? ph(likeParams, `%${q}%`) : null;

    // Final param list start with [q, ...synonymsWords, ...likeParams, pageSize, offset, ...baseParams]
    const searchParamsAll: any[] = [];
    // $1 = q
    searchParamsAll.push(q);
    // $2..$N (synonyms)
    for (let i = 1; i < expanded.length; i++) searchParamsAll.push(expanded[i]);
    // next -> like pattern (if any)
    if (likePh) searchParamsAll.push(`%${q}%`);
    // page size + offset
    searchParamsAll.push(pageSize, offset);
    // finally base filters' params
    searchParamsAll.push(...baseParams);

    // Build WHERE fragment index-aware:
    // After WITH/CTE we'll use ... FROM "Listing" l [baseWhere using the **last** params].
    // For the similarity/like filters, we reference the early parameters:
    const likeRef = likePh ? `$${1 + (expanded.length - 0)} /* qLike */` : null; // position of qLike in searchParamsAll

    const query = `
      WITH expanded AS (
        SELECT $1::text AS q
        ${valuesPlaceholders ? `UNION ALL SELECT word FROM (VALUES ${valuesPlaceholders}) AS t(word)` : ""}
      ),
      scored AS (
        SELECT
          l.*,
          GREATEST(
            similarity(LOWER(l.title), (SELECT q FROM expanded LIMIT 1)),
            similarity(LOWER(l.description), (SELECT q FROM expanded LIMIT 1))
          ) AS sim
        FROM "Listing" l
        ${baseWhere || ""}
      )
      SELECT *
      FROM scored
      WHERE (
        $1 = ''  -- empty q -> no query filter
        OR sim > 0.2
        ${likeRef ? `OR LOWER(title) ILIKE ${likeRef} OR LOWER(description) ILIKE ${likeRef}` : ""}
      )
      ORDER BY
        ${sort === "featured" ? `"featured" DESC,` : ""}  -- small assist when featured sort chosen
        sim DESC NULLS LAST,
        ${sortSQL}
      LIMIT $${expanded.length + (likePh ? 1 : 0) + 1}  -- pageSize
      OFFSET $${expanded.length + (likePh ? 1 : 0) + 2}; -- offset
    `;

    const items = await prisma.$queryRawUnsafe<any[]>(query, ...searchParamsAll);

    // Facets (respect base filters; intentionally do not include trigram q to keep them stable)
    // NOTE: We reuse baseWhere and baseParams safely using $queryRawUnsafe
    const facetTown = await prisma.$queryRawUnsafe<{ town: string; count: number }[]>(
      `SELECT "town", COUNT(*)::int AS count FROM "Listing" ${baseWhere} GROUP BY "town" ORDER BY count DESC NULLS LAST LIMIT 20`,
      ...baseParams
    );

    const facetCategory = await prisma.$queryRawUnsafe<{ category: string; count: number }[]>(
      `SELECT "category", COUNT(*)::int AS count FROM "Listing" ${baseWhere} GROUP BY "category" ORDER BY count DESC NULLS LAST LIMIT 20`,
      ...baseParams
    );

    const facetBrand = await prisma.$queryRawUnsafe<{ brand: string; count: number }[]>(
      `SELECT "brand", COUNT(*)::int AS count FROM "Listing" ${baseWhere} GROUP BY "brand" ORDER BY count DESC NULLS LAST LIMIT 20`,
      ...baseParams
    );

    const facetCondition = await prisma.$queryRawUnsafe<{ condition: string; count: number }[]>(
      `SELECT "condition", COUNT(*)::int AS count FROM "Listing" ${baseWhere} GROUP BY "condition" ORDER BY count DESC NULLS LAST LIMIT 5`,
      ...baseParams
    );

    // Cheap hasMore heuristic: if we filled a page, we *might* have more.
    const hasMore = items.length === pageSize;

    return new NextResponse(
      JSON.stringify({
        items,
        page,
        pageSize,
        hasMore,
        facets: {
          towns: facetTown
            .filter((f: { town: string; count: number }) => f.town)
            .map((f: { town: string; count: number }) => ({ value: f.town, count: f.count })),
          categories: facetCategory
            .filter((f: { category: string; count: number }) => f.category)
            .map((f: { category: string; count: number }) => ({ value: f.category, count: f.count })),
          brands: facetBrand
            .filter((f: { brand: string; count: number }) => f.brand)
            .map((f: { brand: string; count: number }) => ({ value: f.brand, count: f.count })),
          conditions: facetCondition
            .filter((f: { condition: string; count: number }) => f.condition)
            .map((f: { condition: string; count: number }) => ({ value: f.condition, count: f.count })),
        },
      }),
      {
        headers: {
          "content-type": "application/json",
          // cache a little at the edge; feel free to tune based on traffic
          "cache-control": "public, s-maxage=60, stale-while-revalidate=60",
        },
      }
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/search GET] error:", e);
    return new NextResponse(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
}


