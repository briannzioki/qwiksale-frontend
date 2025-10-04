// src/app/api/services/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { jsonPublic, jsonPrivate } from "@/app/api/_lib/responses";
import { auth } from "@/auth";

/* ----------------------------- debug ----------------------------- */
const SERVICES_VER = "vDEBUG-SERVICES-004";
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

/** minimal select for cards */
const serviceListSelect = {
  id: true,
  name: true,
  title: true,
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

    const q = (url.searchParams.get("q") || "").trim();
    const category = optStr(url.searchParams.get("category"));
    const subcategory = optStr(url.searchParams.get("subcategory"));

    // owner filters
    const mine = toBool(url.searchParams.get("mine")) === true;
    let sellerId =
      optStr(url.searchParams.get("sellerId")) ||
      optStr(url.searchParams.get("userId"));
    const sellerUsername =
      optStr(url.searchParams.get("seller")) ||
      optStr(url.searchParams.get("user"));

    if (mine) {
      const session = await auth().catch(() => null);
      const uid = (session as any)?.user?.id as string | undefined;
      if (!uid) {
        const res = jsonPrivate({ error: "Unauthorized" }, { status: 401 });
        attachVersion(res.headers);
        res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
        return res;
      }
      sellerId = uid; // mine wins
    }

    const featured = toBool(url.searchParams.get("featured"));
    const verifiedOnly = toBool(url.searchParams.get("verifiedOnly"));

    // Only apply price filter if params are present
    const minPriceStr = url.searchParams.get("minPrice");
    const maxPriceStr = url.searchParams.get("maxPrice");

    const sort = toSort(url.searchParams.get("sort"));
    const wantFacets = (url.searchParams.get("facets") || "").toLowerCase() === "true";

    // pagination (honor limit OR pageSize)
    const page = toInt(url.searchParams.get("page"), 1, 1, 100000);
    const limitStr = url.searchParams.get("limit");
    const pageSizeStr = url.searchParams.get("pageSize");
    const hasLimit = Number.isFinite(Number(limitStr));
    const hasPageSize = Number.isFinite(Number(pageSizeStr));
    let pageSize = DEFAULT_PAGE_SIZE;
    if (hasLimit) pageSize = toInt(limitStr, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    else if (hasPageSize) pageSize = toInt(pageSizeStr, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

    // Optional cursor (parity with products API)
    const cursor = optStr(url.searchParams.get("cursor"));

    // Guard result window (avoid huge DB offsets) — skip when using cursor
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

    // status override: ?status=ACTIVE|DRAFT|ALL (default ACTIVE)
    const statusParam = optStr(url.searchParams.get("status"));
    const where: Record<string, any> = {};
    if (!statusParam || statusParam.toUpperCase() === "ACTIVE") {
      where["status"] = "ACTIVE";
    } else if (statusParam.toUpperCase() !== "ALL") {
      where["status"] = statusParam.toUpperCase();
    }

    const and: any[] = [];

    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
          { subcategory: { contains: q, mode: "insensitive" } },
          // keep relation optional/tolerant
          { seller: { is: { name: { contains: q, mode: "insensitive" } } } },
        ],
      });
    }
    if (category) and.push({ category: { equals: category, mode: "insensitive" } });
    if (subcategory) and.push({ subcategory: { equals: subcategory, mode: "insensitive" } });
    if (sellerId) and.push({ sellerId });
    if (sellerUsername)
      and.push({
        seller: { is: { username: { equals: sellerUsername, mode: "insensitive" } } },
      });

    // verifiedOnly should override a conflicting featured filter
    if (verifiedOnly === true) {
      and.push({ featured: true });
    } else if (typeof featured === "boolean") {
      and.push({ featured });
    }

    // Price filter logic:
    // - Apply ONLY if minPrice or maxPrice is provided
    // - When minPrice is 0 (or absent), include price:null to allow "unset/free"
    if (minPriceStr !== null || maxPriceStr !== null) {
      const minPrice = minPriceStr !== null ? toInt(minPriceStr, 0, 0, 9_999_999) : undefined;
      const maxPrice = maxPriceStr !== null ? toInt(maxPriceStr, 9_999_999, 0, 9_999_999) : undefined;

      const priceClause: any = {};
      if (typeof minPrice === "number") priceClause.gte = minPrice;
      if (typeof maxPrice === "number") priceClause.lte = maxPrice;

      if (!minPrice || minPrice === 0) {
        and.push({ OR: [{ price: null }, { price: priceClause }] });
      } else {
        and.push({ price: priceClause });
      }
    }

    // When sorting by price, exclude null prices for deterministic ordering
    if (sort === "price_asc" || sort === "price_desc") {
      and.push({ price: { not: null } });
    }

    if (and.length) where["AND"] = and;

    const isSearchLike = q.length > 0 || !!category || !!subcategory;
    let orderBy: any;
    if (sort === "price_asc") orderBy = [{ price: "asc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];
    else if (sort === "price_desc") orderBy = [{ price: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];
    else if (sort === "featured")
      orderBy = [{ featured: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];
    else
      orderBy = isSearchLike
        ? [{ featured: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }]
        : [{ createdAt: "desc" as const }, { id: "desc" as const }];

    if (process.env.NODE_ENV !== "production") {
      console.log("[/api/services WHERE]", safe(where));
      console.log("[/api/services ORDER]", safe(orderBy));
      console.log("[/api/services page/pageSize]", page, pageSize, "cursor:", cursor ?? null);
    }

    // Fetch: page or cursor, take pageSize+1 for hasMore
    const listArgs: any = {
      where,
      select: serviceListSelect,
      orderBy,
      take: pageSize + 1,
    };
    if (cursor) {
      listArgs.cursor = { id: cursor };
      listArgs.skip = 1;
    } else {
      listArgs.skip = (page - 1) * pageSize;
    }

    const [total, servicesRaw, facets] = await Promise.all([
      Service.count({ where }),
      Service.findMany(listArgs),
      wantFacets && !cursor && page === 1 ? computeFacets(where, Service) : Promise.resolve(undefined),
    ]);

    const hasMore = (servicesRaw as unknown[]).length > pageSize;
    const data = hasMore ? (servicesRaw as unknown[]).slice(0, pageSize) : (servicesRaw as unknown[]);
    const nextCursor = hasMore && data.length ? (data[data.length - 1] as any).id : null;

    const items = (data as Array<any>).map((s) => ({
      id: String(s.id),
      name: String(s.name ?? s.title ?? "Service"),
      category: (s.category as string | null) ?? null,
      subcategory: (s.subcategory as string | null) ?? null,
      price: typeof s.price === "number" ? (s.price as number) : null,
      image: (s.image as string | null) ?? null,
      featured: Boolean(s.featured),
      location: (s.location as string | null) ?? null,
      createdAt: s?.createdAt instanceof Date ? s.createdAt.toISOString() : String(s?.createdAt ?? ""),
      sellerId: s.sellerId as string,
      seller: s.seller ?? null,
    }));

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
