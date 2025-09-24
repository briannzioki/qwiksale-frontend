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
function json(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  return res;
}
function setNoStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}
function setEdgeCache(res: NextResponse, seconds = 45) {
  const v = `public, s-maxage=${seconds}, stale-while-revalidate=${seconds}`;
  res.headers.set("Cache-Control", v);
  res.headers.set("CDN-Cache-Control", v);
  res.headers.set("Vary", "Accept-Encoding");
  return res;
}
function addReqId(res: NextResponse, id: string) {
  res.headers.set("x-request-id", id);
  return res;
}
function s(v?: string | null) {
  const t = (v || "").replace(/[\u0000-\u0008\u000B-\u001F\u007F]+/g, "").trim();
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
  // Anonymous only, modest page windows
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

/** Lean selection for search hits. */
const baseSelect = {
  id: true,
  name: true,
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

/** Split "q" into tokens (AND), each token ORs across fields. */
function buildTokenizedWhere(q?: string) {
  if (!q) return undefined;
  const tokens = q
    .split(/[^\p{L}\p{N}]+/u) // split on non letters/numbers (unicode aware)
    .map((t) => t.trim())
    .filter(Boolean);

  if (!tokens.length) return undefined;

  const perTokenOr = (tok: string) => ({
    OR: [
      { name: { contains: tok, mode: "insensitive" } },
      { brand: { contains: tok, mode: "insensitive" } },
      { category: { contains: tok, mode: "insensitive" } },
      { subcategory: { contains: tok, mode: "insensitive" } },
      { location: { contains: tok, mode: "insensitive" } },
      { sellerName: { contains: tok, mode: "insensitive" } },
      { sellerLocation: { contains: tok, mode: "insensitive" } },
    ],
  });

  return { AND: tokens.map(perTokenOr) };
}

/* ------------------------------ GET ------------------------------ */
export async function GET(req: NextRequest) {
  const reqId =
    (globalThis as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);

  try {
    // Per-IP throttle
    const rl = await checkRateLimit(req.headers, {
      name: "products_search",
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.ok) {
      return addReqId(
        tooMany("You’re searching too fast. Please slow down.", rl.retryAfterSec),
        reqId
      );
    }

    const url = new URL(req.url);
    const qRaw = s(url.searchParams.get("q"));
    const qWhere = buildTokenizedWhere(qRaw);

    const category = s(url.searchParams.get("category"));
    const subcategory = s(url.searchParams.get("subcategory"));
    const brand = s(url.searchParams.get("brand"));
    const condition = s(url.searchParams.get("condition"));
    let minPrice = n(url.searchParams.get("minPrice"));
    let maxPrice = n(url.searchParams.get("maxPrice"));
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

    // Fix reversed price range (if user passed min>max)
    if (
      Number.isFinite(minPrice) &&
      Number.isFinite(maxPrice) &&
      (minPrice as number) > (maxPrice as number)
    ) {
      const tmp = minPrice!;
      minPrice = maxPrice!;
      maxPrice = tmp;
    }

    // WHERE
    const where: any = { status: "ACTIVE" };
    const and: any[] = [];

    if (qWhere) and.push(qWhere);
    if (category) and.push({ category: { equals: category, mode: "insensitive" } });
    if (subcategory) and.push({ subcategory: { equals: subcategory, mode: "insensitive" } });
    if (brand) and.push({ brand: { equals: brand, mode: "insensitive" } });
    if (condition) and.push({ condition: { equals: condition, mode: "insensitive" } });
    if (typeof negotiable === "boolean") and.push({ negotiable });
    if (verifiedOnly === true) and.push({ featured: true });

    // Price range: AND bounds; optionally include nulls
    if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
      const price: any = {};
      if (Number.isFinite(minPrice)) price.gte = Math.max(0, minPrice!);
      if (Number.isFinite(maxPrice)) price.lte = Math.max(0, maxPrice!);
      and.push(includeNoPrice ? { OR: [{ price: null }, { price }] } : { price });
    } else if (includeNoPrice === false) {
      // If sorting by price and user didn't request nulls, drop nulls to keep order meaningful
      if (sort === "price_asc" || sort === "price_desc") {
        and.push({ NOT: { price: null } });
      }
    }

    if (and.length) where.AND = and;

    // ORDER BY (with id tiebreaker for stable pagination)
    let orderBy: any[] = [];
    switch (sort) {
      case "new":
        orderBy = [{ createdAt: "desc" }];
        break;
      case "price_asc":
        // Prisma supports nulls ordering in recent versions; fall back silently if unavailable
        orderBy = [{ price: { sort: "asc", nulls: "last" } as any }, { createdAt: "desc" }];
        break;
      case "price_desc":
        orderBy = [{ price: { sort: "desc", nulls: "last" } as any }, { createdAt: "desc" }];
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
        const res = json({
          page: safePage,
          pageSize,
          total,
          totalPages,
          items: [] as any[],
          nextCursor: null,
          hasMore: false,
          applied: {
            q: qRaw || undefined,
            category,
            subcategory,
            brand,
            condition,
            minPrice,
            maxPrice,
            includeNoPrice,
            verifiedOnly,
            negotiable,
            sort,
          },
        });
        return addReqId(setNoStore(res), reqId);
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
    const nextCursor = hasMore ? (data[data.length - 1]?.id ?? null) : null;

    const payload = {
      page: safePage,
      pageSize,
      total,
      totalPages,
      items: data.map(shape),
      nextCursor,
      hasMore,
      applied: {
        q: qRaw || undefined,
        category,
        subcategory,
        brand,
        condition,
        minPrice,
        maxPrice,
        includeNoPrice,
        verifiedOnly,
        negotiable,
        sort,
      },
    };

    const res = json(payload);
    return addReqId(
      isSafeToCache(req, safePage, pageSize) ? setEdgeCache(res, 45) : setNoStore(res),
      reqId
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[products/search GET] error", e);
    return addReqId(setNoStore(json({ error: "Server error" }, { status: 500 })), reqId);
  }
}
