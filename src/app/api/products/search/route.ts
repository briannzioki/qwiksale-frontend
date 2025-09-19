// src/app/api/products/search/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";

/* ---------------------------- helpers ---------------------------- */
function resp(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  return res;
}
function setNoStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}
function setEdgeCache(res: NextResponse, seconds = 45) {
  const v = `public, s-maxage=${seconds}, stale-while-revalidate=${seconds}`;
  res.headers.set("Cache-Control", v);
  res.headers.set("CDN-Cache-Control", v);
  res.headers.set("Vary", "Accept-Encoding");
  return res;
}
function s(v?: string | null) {
  const t = (v || "").trim();
  return t ? t : undefined;
}
function n(v?: string | null) {
  if (v == null || v === "") return undefined;
  const num = Number(v);
  return Number.isFinite(num) ? Math.trunc(num) : undefined;
}
function b(v?: string | null) {
  const t = (v || "").trim().toLowerCase();
  if (["1", "true", "yes"].includes(t)) return true;
  if (["0", "false", "no"].includes(t)) return false;
  return undefined;
}
function isSafeToCache(req: NextRequest, page: number, pageSize: number) {
  // Conservative: only cache anonymous, non-personalized, reasonable pages
  const auth = req.headers.get("authorization");
  const cookie = req.headers.get("cookie");
  if (auth || (cookie && cookie.includes("session"))) return false;
  if (page > 10 || pageSize > 48) return false;
  return true;
}

/* ----------------------------- safety caps ------------------------------ */
const MAX_PAGE_SIZE = 48;
const DEFAULT_PAGE_SIZE = 24;
const MAX_RESULT_WINDOW = 10_000; // guard deep offset scans

/** Lean selection for search hits: keep payload tiny. */
const baseSelect = {
  id: true,
  name: true,
  // Omit big fields like description/gallery to avoid huge JSON.
  // Re-add a short snippet only if you truly need it.
  category: true,
  subcategory: true,
  brand: true,
  condition: true,
  price: true,
  image: true,
  location: true,
  negotiable: true,
  featured: true,
  createdAt: true,
  sellerId: true,
  sellerName: true,
  sellerLocation: true,
  sellerMemberSince: true,
  sellerRating: true,
  sellerSales: true,
  seller: {
    select: {
      id: true,
      name: true,
      image: true,
      subscription: true,
      username: true,
    },
  },
} as const;

function shape(row: any) {
  return {
    ...row,
    createdAt:
      row?.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row?.createdAt ?? ""),
  };
}

/* ------------------------------ GET ------------------------------ */
export async function GET(req: NextRequest) {
  try {
    // Per-IP throttle
    const rl = await checkRateLimit(req.headers, {
      name: "products_search",
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.ok) {
      return tooMany("You’re searching too fast. Please slow down.", rl.retryAfterSec);
    }

    const url = new URL(req.url);
    const q = s(url.searchParams.get("q"));
    const category = s(url.searchParams.get("category"));
    const subcategory = s(url.searchParams.get("subcategory"));
    const brand = s(url.searchParams.get("brand"));
    const condition = s(url.searchParams.get("condition"));
    const minPrice = n(url.searchParams.get("minPrice"));
    const maxPrice = n(url.searchParams.get("maxPrice"));
    const includeNoPrice = b(url.searchParams.get("includeNoPrice")) === true; // default false
    const verifiedOnly = b(url.searchParams.get("verifiedOnly"));
    const negotiable = b(url.searchParams.get("negotiable"));
    const sort = (s(url.searchParams.get("sort")) || "top") as
      | "top"
      | "new"
      | "price_asc"
      | "price_desc";

    // pagination: prefer cursor; otherwise page/skip
    const cursor = s(url.searchParams.get("cursor"));
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const rawPageSize = Number(url.searchParams.get("pageSize") || DEFAULT_PAGE_SIZE);
    const pageSize =
      Number.isFinite(rawPageSize) && rawPageSize > 0
        ? Math.min(MAX_PAGE_SIZE, Math.trunc(rawPageSize))
        : DEFAULT_PAGE_SIZE;

    // WHERE
    const where: any = { status: "ACTIVE" };
    const and: any[] = [];

    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { brand: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
          { subcategory: { contains: q, mode: "insensitive" } },
          { location: { contains: q, mode: "insensitive" } },
          { sellerName: { contains: q, mode: "insensitive" } },
          { sellerLocation: { contains: q, mode: "insensitive" } },
        ],
      });
    }
    if (category) and.push({ category: { equals: category, mode: "insensitive" } });
    if (subcategory) and.push({ subcategory: { equals: subcategory, mode: "insensitive" } });
    if (brand) and.push({ brand: { equals: brand, mode: "insensitive" } });
    if (condition) and.push({ condition: { equals: condition, mode: "insensitive" } });
    if (typeof negotiable === "boolean") and.push({ negotiable });
    if (verifiedOnly === true) and.push({ featured: true });

    // Price range: AND the bounds; optionally include nulls
    if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
      const price: any = {};
      if (Number.isFinite(minPrice)) price.gte = Math.max(0, minPrice!);
      if (Number.isFinite(maxPrice)) price.lte = Math.max(0, maxPrice!);
      and.push(
        includeNoPrice ? { OR: [{ price: null }, { price }] } : { price }
      );
    }

    if (and.length) where.AND = and;

    // ORDER BY (with id tiebreaker for stable pagination)
    let orderBy: any[] = [];
    switch (sort) {
      case "new":
        orderBy = [{ createdAt: "desc" }];
        break;
      case "price_asc":
        orderBy = [{ price: "asc" }, { createdAt: "desc" }];
        break;
      case "price_desc":
        orderBy = [{ price: "desc" }, { createdAt: "desc" }];
        break;
      case "top":
      default:
        orderBy = [{ featured: "desc" }, { createdAt: "desc" }];
        break;
    }
    orderBy.push({ id: "desc" });

    // Count for pagination UI
    const total = await prisma.product.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);

    // Guard result window if using skip
    if (!cursor) {
      const skipEst = (safePage - 1) * pageSize;
      if (skipEst > MAX_RESULT_WINDOW) {
        const res = resp({
          page: safePage,
          pageSize,
          total,
          totalPages,
          items: [] as any[],
          nextCursor: null,
          hasMore: false,
        });
        return setNoStore(res);
      }
    }

    // Build list query (cursor wins)
    const listArgs: any = {
      where,
      orderBy,
      select: baseSelect,
      take: pageSize + 1, // +1 to detect next page
    };
    if (cursor) {
      listArgs.cursor = { id: cursor };
      listArgs.skip = 1;
    } else {
      listArgs.skip = (safePage - 1) * pageSize;
    }

    const rows = await prisma.product.findMany(listArgs);
    const hasMore = rows.length > pageSize;
    const data = hasMore ? rows.slice(0, pageSize) : rows;
    const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null;

    const json = {
      page: safePage,
      pageSize,
      total,
      totalPages,
      items: data.map(shape),
      nextCursor,
      hasMore,
    };

    const res = resp(json);
    return isSafeToCache(req, safePage, pageSize) ? setEdgeCache(res, 45) : setNoStore(res);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[products/search GET] error", e);
    return setNoStore(resp({ error: "Server error" }, { status: 500 }));
  }
}
