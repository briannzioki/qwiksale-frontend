// src/app/api/services/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { jsonPublic, jsonPrivate } from "@/app/api/_lib/responses";

/* ----------------------------- debug ----------------------------- */
const SERVICES_VER = "vDEBUG-SERVICES-005";
function attachVersion(h: Headers) {
  h.set("X-Services-Version", SERVICES_VER);
}
function safe(obj: unknown) {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}

/* ----------------------------- tiny helpers ----------------------------- */
function toInt(v: string | null, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
function toBool(v: string | null): boolean | undefined {
  if (v == null) return undefined;
  const t = v.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(t)) return true;
  if (["0", "false", "no", "off"].includes(t)) return false;
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

/** Access a Service-model compat layer that may not exist in this schema */
function getServiceModel() {
  const anyPrisma = prisma as any;
  const svc =
    anyPrisma.service ??
    anyPrisma.services ??
    anyPrisma.Service ??
    anyPrisma.Services ??
    null;
  return typeof svc?.findMany === "function" ? svc : null;
}

/* ------------------------------ caps ----------------------------------- */
const MAX_PAGE_SIZE = 48;
const DEFAULT_PAGE_SIZE = 24;
const MAX_RESULT_WINDOW = 10_000;

/* -------------------------- GET /api/services -------------------------- */
export async function GET(req: NextRequest) {
  try {
    const Service = getServiceModel();
    if (!Service) {
      const res = jsonPublic(
        {
          page: 1,
          pageSize: 0,
          total: 0,
          totalPages: 1,
          sort: "newest" as const,
          items: [] as any[],
          facets: undefined,
          nextCursor: null,
          hasMore: false,
        },
        60
      );
      attachVersion(res.headers);
      res.headers.set("X-Total-Count", "0");
      res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
      return res;
    }

    const url = new URL(req.url);
    if (process.env.NODE_ENV !== "production") {
      console.log("[/api/services GET]", SERVICES_VER, url.toString());
    }

    const q = (url.searchParams.get("q") || "").trim().slice(0, 64);
    const category = optStr(url.searchParams.get("category"));
    const subcategory = optStr(url.searchParams.get("subcategory"));

    // Ownership filters
    let sellerId =
      optStr(url.searchParams.get("sellerId")) ||
      optStr(url.searchParams.get("userId"));
    const sellerUsername =
      optStr(url.searchParams.get("seller")) ||
      optStr(url.searchParams.get("user"));

    // If a username is provided, resolve to id to avoid relying on a relation in where
    if (!sellerId && sellerUsername) {
      try {
        const u = await prisma.user.findUnique({
          where: { username: sellerUsername },
          select: { id: true },
        });
        sellerId = u?.id ?? sellerId;
      } catch {
        /* ignore user lookup errors */
      }
    }

    const featured = toBool(url.searchParams.get("featured"));
    const verifiedOnly = toBool(url.searchParams.get("verifiedOnly"));

    // Price filters (apply only if present)
    const minPriceStr = url.searchParams.get("minPrice");
    const maxPriceStr = url.searchParams.get("maxPrice");

    const sort = toSort(url.searchParams.get("sort"));
    const wantFacets = (url.searchParams.get("facets") || "").toLowerCase() === "true";

    // Pagination (honor limit over pageSize)
    const cursor = optStr(url.searchParams.get("cursor"));
    const page = toInt(url.searchParams.get("page"), 1, 1, 100000);
    const limitStr = url.searchParams.get("limit");
    const pageSizeStr = url.searchParams.get("pageSize");
    const hasLimit = Number.isFinite(Number(limitStr));
    const hasPageSize = Number.isFinite(Number(pageSizeStr));
    let pageSize = DEFAULT_PAGE_SIZE;
    if (hasLimit) pageSize = toInt(limitStr, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    else if (hasPageSize) pageSize = toInt(pageSizeStr, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

    // status override: ?status=ACTIVE|DRAFT|ALL (default ACTIVE)
    const statusParam = optStr(url.searchParams.get("status"));
    const where: Record<string, any> = {};
    if (!statusParam || statusParam.toUpperCase() === "ACTIVE") {
      where["status"] = "ACTIVE";
    } else if (statusParam.toUpperCase() !== "ALL") {
      where["status"] = statusParam.toUpperCase();
    }

    const AND: any[] = [];

    if (q) {
      AND.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
          { subcategory: { contains: q, mode: "insensitive" } },
        ],
      });
    }
    if (category) AND.push({ category: { equals: category, mode: "insensitive" } });
    if (subcategory) AND.push({ subcategory: { equals: subcategory, mode: "insensitive" } });
    if (sellerId) AND.push({ sellerId });

    // verifiedOnly overrides featured
    if (verifiedOnly === true) {
      AND.push({ featured: true });
    } else if (typeof featured === "boolean") {
      AND.push({ featured });
    }

    // Price filter logic
    if (minPriceStr !== null || maxPriceStr !== null) {
      const minPrice = minPriceStr !== null ? toInt(minPriceStr, 0, 0, 9_999_999) : undefined;
      const maxPrice = maxPriceStr !== null ? toInt(maxPriceStr, 9_999_999, 0, 9_999_999) : undefined;

      const priceClause: { gte?: number; lte?: number } = {};
      if (typeof minPrice === "number") priceClause.gte = minPrice;
      if (typeof maxPrice === "number") priceClause.lte = maxPrice;

      if (!minPrice || minPrice === 0) {
        AND.push({ OR: [{ price: null }, { price: priceClause }] });
      } else {
        AND.push({ price: priceClause });
      }
    }

    // When sorting by price, exclude nulls for stable ordering
    if (sort === "price_asc" || sort === "price_desc") {
      AND.push({ price: { not: null } });
    }

    if (AND.length) where["AND"] = AND;

    const isSearchLike = q.length > 0 || !!category || !!subcategory;

    // Primary orderBy + fallbacks if fields are missing in schema
    let primaryOrder: any;
    if (sort === "price_asc") primaryOrder = [{ price: "asc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];
    else if (sort === "price_desc") primaryOrder = [{ price: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];
    else if (sort === "featured")
      primaryOrder = [{ featured: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];
    else
      primaryOrder = isSearchLike
        ? [{ featured: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }]
        : [{ createdAt: "desc" as const }, { id: "desc" as const }];

    const orderByCandidates = [
      primaryOrder,
      [{ createdAt: "desc" as const }, { id: "desc" as const }],
      [{ id: "desc" as const }],
      undefined,
    ];

    if (process.env.NODE_ENV !== "production") {
      console.log("[/api/services WHERE]", safe(where));
      console.log("[/api/services ORDER primary]", safe(primaryOrder));
      console.log("[/api/services page/pageSize]", page, pageSize, "cursor:", cursor ?? null);
    }

    // Guard result window (skip if using cursor)
    if (!cursor) {
      const skipEst = (page - 1) * pageSize;
      if (skipEst > MAX_RESULT_WINDOW) {
        const res = jsonPublic(
          {
            page,
            pageSize,
            total: 0,
            totalPages: 1,
            sort,
            items: [],
            facets: wantFacets ? { categories: [], subcategories: [] } : undefined,
            nextCursor: null,
            hasMore: false,
          },
          60
        );
        attachVersion(res.headers);
        res.headers.set("X-Total-Count", "0");
        res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
        return res;
      }
    }

    // Select candidates (schema tolerant)
    const selectCandidates: any[] = [
      // rich (with location & featured)
      { id: true, name: true, title: true, category: true, subcategory: true, price: true, image: true, location: true, featured: true, createdAt: true, sellerId: true },
      { id: true, name: true, category: true, subcategory: true, price: true, image: true, location: true, featured: true, createdAt: true, sellerId: true },
      // without location
      { id: true, name: true, title: true, category: true, subcategory: true, price: true, image: true, featured: true, createdAt: true, sellerId: true },
      { id: true, name: true, category: true, subcategory: true, price: true, image: true, featured: true, createdAt: true, sellerId: true },
      // minimal
      { id: true, name: true, createdAt: true, featured: true },
      { id: true, title: true, createdAt: true, featured: true },
      { id: true, name: true, createdAt: true },
      { id: true, title: true, createdAt: true },
      { id: true },
    ];

    // Build list args with pagination
    const baseListArgs: any = {
      where,
      take: pageSize + 1,
    };
    if (cursor) {
      baseListArgs.cursor = { id: cursor };
      baseListArgs.skip = 1;
    } else {
      baseListArgs.skip = (page - 1) * pageSize;
    }

    // total first (cheap & robust)
    const total = await Service.count({ where });

    // findMany with tolerant select + orderBy fallbacks
    let rowsRaw: any[] = [];
    outer:
    for (const select of selectCandidates) {
      for (const orderBy of orderByCandidates) {
        try {
          rowsRaw = await Service.findMany({ ...baseListArgs, select, orderBy });
          break outer;
        } catch (e) {
          /* try next combo */
        }
      }
    }

    const hasMore = rowsRaw.length > pageSize;
    const data = hasMore ? rowsRaw.slice(0, pageSize) : rowsRaw;
    const nextCursor = hasMore && data.length ? data[data.length - 1]!.id : null;

    const items = (data as Array<any>).map((s) => ({
      id: String(s.id),
      name: String(s.name ?? s.title ?? "Service"),
      category: (s.category ?? null) as string | null,
      subcategory: (s.subcategory ?? null) as string | null,
      price: typeof s.price === "number" ? s.price : null,
      image: (s.image ?? null) as string | null,
      featured: Boolean(s.featured),
      location: (s.location ?? null) as string | null,
      createdAt:
        s?.createdAt instanceof Date
          ? s.createdAt.toISOString()
          : typeof s?.createdAt === "string"
          ? s.createdAt
          : "",
      sellerId: s?.sellerId ? String(s.sellerId) : undefined,
    }));

    // facets (first page only, no cursor)
    let facets: any | undefined = undefined;
    if (wantFacets && !cursor && page === 1) {
      facets = await computeFacets(where, Service);
    }

    const res = jsonPublic(
      {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / Math.max(1, pageSize))),
        sort,
        items,
        facets,
        nextCursor,
        hasMore,
      },
      60
    );
    attachVersion(res.headers);
    res.headers.set("X-Total-Count", String(total));
    res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
    return res;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/services GET] error:", e);
    const res = jsonPrivate({ error: "Server error" }, { status: 500 });
    attachVersion(res.headers);
    res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
    return res;
  }
}

/* -------------------------- POST /api/services ------------------------- */
export async function POST(req: NextRequest) {
  const Service = getServiceModel();
  if (!Service) {
    const res = jsonPrivate({ error: "Service model not available in this schema." }, { status: 501 });
    attachVersion(res.headers);
    res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
    return res;
  }
  const { POST: createService } = await import("./create/route");
  return createService(req);
}

/* ------------------------------ facets -------------------------------- */
type CatRow = { category: string | null; _count: { _all: number } };
type SubcatRow = { subcategory: string | null; _count: { _all: number } };

async function computeFacets(where: any, Service: any) {
  try {
    const [catsRaw, subsRaw] = await Promise.all([
      Service.groupBy({ by: ["category"], where, _count: { _all: true } }),
      Service.groupBy({ by: ["subcategory"], where, _count: { _all: true } }),
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

/* ----------------------------- misc verbs ----------------------------- */
export async function HEAD() {
  const res = jsonPublic(null, 60, { status: 204 });
  attachVersion(res.headers);
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}

export async function OPTIONS() {
  const res = jsonPublic({ ok: true }, 60, { status: 204 });
  attachVersion(res.headers);
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}

