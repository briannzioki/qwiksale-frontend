// src/app/api/search/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";

/**
 * Full-text-ish listing search (pg_trgm similarity + ILIKE fallback) with filters & facets.
 */

const MAX_PAGE_SIZE = 50;

const toBool = (v: string | null) => v === "1" || v?.toLowerCase() === "true";
const toNum = (v: string | null, d = 0) => {
  const n = Number(v ?? "");
  return Number.isFinite(n) ? n : d;
};
const normQuery = (q: string) => q.trim().toLowerCase();

/** build-and-push placeholder helper */
function ph(params: any[], val: any) {
  params.push(val);
  return `$${params.length}`;
}

function isAnonSafe(req: NextRequest, page: number, pageSize: number) {
  const auth = req.headers.get("authorization");
  const cookie = req.headers.get("cookie");
  if (auth || (cookie && cookie.includes("session"))) return false;
  if (page > 10 || pageSize > 48) return false;
  return true;
}

function setNoStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}
function setEdgeCache(res: NextResponse, seconds = 60) {
  const v = `public, s-maxage=${seconds}, stale-while-revalidate=${seconds}`;
  res.headers.set("Cache-Control", v);
  res.headers.set("CDN-Cache-Control", v);
  res.headers.set("Vary", "Accept-Encoding");
  return res;
}

/* ---------- result types so callbacks aren’t implicit any ---------- */
interface Row {
  id: string;
  title: string;
  price: number | null;
  image: string | null;
  town: string | null;
  category: string | null;
  brand: string | null;
  condition: string | null;
  featured: boolean;
  createdAt: Date | string;
  _total?: number;
}

interface TownFacet { town: string; count: number }
interface CategoryFacet { category: string; count: number }
interface BrandFacet { brand: string; count: number }
interface ConditionFacet { condition: string; count: number }

export async function GET(req: NextRequest) {
  try {
    // Per-IP throttle
    const rl = await checkRateLimit(req.headers, {
      name: "unified_search",
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.ok) return tooMany("You’re searching too fast. Please slow down.", rl.retryAfterSec);

    const url = new URL(req.url);
    const qRaw = url.searchParams.get("q") ?? "";
    const q = normQuery(qRaw);

    const town = url.searchParams.get("town") ?? "";
    const category = url.searchParams.get("category") ?? "";
    const minPrice = url.searchParams.get("minPrice");
    const maxPrice = url.searchParams.get("maxPrice");
    const condition = (url.searchParams.get("condition") ?? "all").toLowerCase(); // all | brand new | pre-owned
    const sort = (url.searchParams.get("sort") ?? "newest") as
      | "newest"
      | "price_asc"
      | "price_desc"
      | "featured";
    const verifiedOnly = toBool(url.searchParams.get("verifiedOnly"));

    const page = Math.max(1, toNum(url.searchParams.get("page"), 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, toNum(url.searchParams.get("pageSize"), 20)));
    const offset = (page - 1) * pageSize;

    // Pull synonyms (optional)
    const synonymsRows =
      q.length > 0
        ? ((await prisma.$queryRaw`
            SELECT unnest(expands_to) as word
            FROM "Synonym"
            WHERE term = ${q}
          `) as { word: string }[])
        : [];
    const synonyms = synonymsRows
      .map((r: { word: string }) => (r?.word ?? "").toLowerCase())
      .filter((w: string) => Boolean(w));

    // ---------------- base filters (shared by hits + facets) ----------------
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

    const baseWhere = baseFilters.length ? `WHERE ${baseFilters.join(" AND ")}` : "";

    // ------------------- build the main SQL with placeholders -------------------
    const params: any[] = [];

    // expanded CTE (q + synonyms)
    const qPhs: string[] = [];
    qPhs.push(ph(params, q)); // first is the main q
    for (const syn of synonyms) qPhs.push(ph(params, syn));
    const expandedCTE =
      qPhs.length > 0
        ? `expanded AS (\n  ${qPhs.map((p, i) => (i === 0 ? `SELECT ${p} AS q` : `UNION ALL SELECT ${p}`)).join("\n  ")}\n)`
        : `expanded AS (SELECT ''::text AS q)`; // empty q

    // like pattern (only if q present)
    const likePh = q ? ph(params, `%${q}%`) : null;

    // sort fragment (stable with id tiebreak)
    const sortSQL =
      sort === "price_asc"
        ? `"price" ASC NULLS LAST, "createdAt" DESC, "id" DESC`
        : sort === "price_desc"
        ? `"price" DESC NULLS LAST, "createdAt" DESC, "id" DESC`
        : sort === "featured"
        ? `"featured" DESC, "createdAt" DESC, "id" DESC`
        : `"createdAt" DESC, "id" DESC`;

    // LIMIT/OFFSET
    const limitPh = ph(params, pageSize);
    const offsetPh = ph(params, offset);

    // Append base filters’ params and shift their $ indexes in the WHERE string
    const baseStartIndex = params.length + 1;
    params.push(...baseParams);
    const shift = baseStartIndex - 1;
    const baseWhereShifted = baseWhere.replace(/\$(\d+)/g, (_: string, n: string) => `$${Number(n) + shift}`);

    // Main SQL. Uses window COUNT(*) OVER() to return total alongside rows.
    const sql = `
      WITH
      ${expandedCTE},
      scored AS (
        SELECT
          l.*,
          GREATEST(
            similarity(LOWER(l.title), (SELECT q FROM expanded LIMIT 1)),
            similarity(LOWER(l.description), (SELECT q FROM expanded LIMIT 1))
          ) AS sim
        FROM "Listing" l
        ${baseWhereShifted}
      ),
      filtered AS (
        SELECT *
        FROM scored
        WHERE (
          ${q ? "($1 <> '' AND (sim > 0.2" : "($1 = ''"}  -- if q is empty, skip similarity/like
          ${likePh ? ` OR LOWER(title) ILIKE ${likePh} OR LOWER(description) ILIKE ${likePh}` : ""}
          ${q ? "))" : ")"}
        )
      )
      SELECT
        id, title, price, image, town, category, brand, "condition", featured, "createdAt",
        COUNT(*) OVER()::int AS _total
      FROM filtered
      ORDER BY
        ${sort === "featured" ? `featured DESC,` : ""}
        sim DESC NULLS LAST,
        ${sortSQL}
      LIMIT ${limitPh}
      OFFSET ${offsetPh};
    `;

    let rows: Row[] = [];
    try {
      rows = (await prisma.$queryRawUnsafe(sql, ...params)) as Row[];
    } catch (err: any) {
      // Fallback if pg_trgm/similarity is unavailable: drop similarity and rely on ILIKE only.
      if (String(err?.message || "").toLowerCase().includes("similarity")) {
        const likeOnly = `
          WITH base AS (
            SELECT l.*
            FROM "Listing" l
            ${baseWhereShifted}
          ),
          filtered AS (
            SELECT *
            FROM base
            WHERE (
              ${q ? "($1 <> '' AND (" : "($1 = ''"} 
              ${likePh ? `LOWER(title) ILIKE ${likePh} OR LOWER(description) ILIKE ${likePh}` : "TRUE"}
              ${q ? "))" : ")"}
            )
          )
          SELECT
            id, title, price, image, town, category, brand, "condition", featured, "createdAt",
            COUNT(*) OVER()::int AS _total
          FROM filtered
          ORDER BY ${sortSQL}
          LIMIT ${limitPh}
          OFFSET ${offsetPh};
        `;
        rows = (await prisma.$queryRawUnsafe(likeOnly, ...params)) as Row[];
      } else {
        throw err;
      }
    }

    const total = rows[0]?._total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const hasMore = page < totalPages;

    // Facets (use ONLY base filters for stability; no trigram/like here)
    const facetParams = [...baseParams];
    const facetWhere = baseWhere || ""; // $1..$N for facetParams

    const towns = (await prisma.$queryRawUnsafe(
      `SELECT "town", COUNT(*)::int AS count FROM "Listing" ${facetWhere} GROUP BY "town" ORDER BY count DESC NULLS LAST LIMIT 20`,
      ...facetParams
    )) as TownFacet[];

    const categories = (await prisma.$queryRawUnsafe(
      `SELECT "category", COUNT(*)::int AS count FROM "Listing" ${facetWhere} GROUP BY "category" ORDER BY count DESC NULLS LAST LIMIT 20`,
      ...facetParams
    )) as CategoryFacet[];

    const brands = (await prisma.$queryRawUnsafe(
      `SELECT "brand", COUNT(*)::int AS count FROM "Listing" ${facetWhere} GROUP BY "brand" ORDER BY count DESC NULLS LAST LIMIT 20`,
      ...facetParams
    )) as BrandFacet[];

    const conditions = (await prisma.$queryRawUnsafe(
      `SELECT "condition", COUNT(*)::int AS count FROM "Listing" ${facetWhere} GROUP BY "condition" ORDER BY count DESC NULLS LAST LIMIT 5`,
      ...facetParams
    )) as ConditionFacet[];

    const json = {
      page,
      pageSize,
      total,
      totalPages,
      hasMore,
      items: rows.map((r: Row) => ({
        id: r.id,
        title: r.title,
        price: r.price,
        image: r.image,
        town: r.town,
        category: r.category,
        brand: r.brand,
        condition: r.condition,
        featured: r.featured,
        createdAt:
          r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
      })),
      facets: {
        towns: towns.filter((f: TownFacet) => f.town).map((f: TownFacet) => ({ value: f.town, count: f.count })),
        categories: categories.filter((f: CategoryFacet) => f.category).map((f: CategoryFacet) => ({ value: f.category, count: f.count })),
        brands: brands.filter((f: BrandFacet) => f.brand).map((f: BrandFacet) => ({ value: f.brand, count: f.count })),
        conditions: conditions
          .filter((f: ConditionFacet) => f.condition)
          .map((f: ConditionFacet) => ({ value: f.condition, count: f.count })),
      },
    };

    const res = NextResponse.json(json);
    return isAnonSafe(req, page, pageSize) ? setEdgeCache(res, 60) : setNoStore(res);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/search GET] error:", e);
    return setNoStore(NextResponse.json({ error: "Server error" }, { status: 500 }));
  }
}
