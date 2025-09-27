// src/app/api/home-feed/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";

/* -------------------- debug -------------------- */
const HF_VER = "vDEBUG-003";

/* -------------------- helpers -------------------- */

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}
function respond(payload: unknown, init?: ResponseInit) {
  const out = noStore(payload, init);
  out.headers.set("X-HF-Version", HF_VER);
  return out;
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

type Mode = "all" | "products" | "services";
type SortKey = "newest" | "featured" | "price_asc" | "price_desc";
function toSort(v: string | null): SortKey {
  const t = (v || "").trim().toLowerCase();
  if (t === "price_asc" || t === "price-asc") return "price_asc";
  if (t === "price_desc" || t === "price-desc") return "price_desc";
  if (t === "featured") return "featured";
  return "newest";
}

/** Typed rows */
type ProductRow = {
  id: string; name: string;
  category: string | null; subcategory: string | null;
  price: number | null; image: string | null; location: string | null;
  featured: boolean | null; createdAt: Date | string | null;
};
type ServiceRow = {
  id: string; name: string;
  category: string | null; subcategory: string | null;
  price: number | null; image: string | null; location: string | null;
  featured: boolean | null; createdAt: Date | string | null;
};
type PriceClause = { gte?: number; lte?: number };

type CombinedItem = {
  type: "product" | "service";
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  price: number | null;
  image: string | null;
  location: string | null;
  featured: boolean;
  createdAt: string;
};

function parseQuery(req: NextRequest): {
  mode: Mode;
  page: number;
  q?: string; category?: string; subcategory?: string; brand?: string; condition?: string;
  featuredOnly: boolean; minPriceStr: string | null; maxPriceStr: string | null;
  sort: SortKey; pageSize: number; facets: boolean; status?: string;
} {
  const sp = req.nextUrl.searchParams;

  const rawMode = (sp.get("t") || sp.get("mode") || "all").toLowerCase();
  const mode: Mode = rawMode === "services" ? "services" : rawMode === "products" ? "products" : "all";

  const q = optStr(sp.get("q"));
  const category = optStr(sp.get("category"));
  const subcategory = optStr(sp.get("subcategory"));
  const brand = optStr(sp.get("brand"));
  const condition = optStr(sp.get("condition"));

  const minPriceStr = sp.get("minPrice");
  const maxPriceStr = sp.get("maxPrice");
  const pageSizeStr = sp.get("pageSize");
  const limitStr = sp.get("limit");
  const page = toInt(sp.get("page"), 1, 1, 10_000);

  const featuredOnly = toBool(sp.get("featured")) === true;
  const sort = toSort(sp.get("sort"));
  const facets = (sp.get("facets") || "").toLowerCase() === "true";

  let pageSize = 24;
  const hasLimit = Number.isFinite(Number(limitStr));
  const hasPageSize = Number.isFinite(Number(pageSizeStr));
  if (hasLimit) pageSize = toInt(limitStr, 24, 1, 48);
  else if (hasPageSize) pageSize = toInt(pageSizeStr, 24, 1, 48);

  const out = {
    mode, page, featuredOnly, sort, pageSize, facets, minPriceStr, maxPriceStr,
  } as {
    mode: Mode; page: number;
    q?: string; category?: string; subcategory?: string; brand?: string; condition?: string;
    featuredOnly: boolean; minPriceStr: string | null; maxPriceStr: string | null;
    sort: SortKey; pageSize: number; facets: boolean; status?: string;
  };

  if (q) out.q = q;
  if (category) out.category = category;
  if (subcategory) out.subcategory = subcategory;
  if (brand) out.brand = brand;
  if (condition === "brand new" || condition === "pre-owned") out.condition = condition;

  const statusParam = optStr(sp.get("status"));
  if (statusParam) out.status = statusParam;

  return out;
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

/* ----------------------------- facets helpers ----------------------------- */
type CatRow = { category: string | null; _count: { _all: number } };
type BrandRow = { brand: string | null; _count: { _all: number } };
type CondRow = { condition: string | null; _count: { _all: number } };
type SubcatRow = { subcategory: string | null; _count: { _all: number } };

function coalesceCaseInsensitive<T>(
  rows: T[],
  pick: (r: T) => string | null
): Array<{ value: string; count: number }> {
  const map = new Map<string, { value: string; count: number }>();
  for (const r of rows) {
    const raw = pick(r);
    if (!raw) continue;
    const display = String(raw).trim();
    if (!display) continue;
    const key = display.toLowerCase();
    const prev = map.get(key);
    const add = (r as any)._count?._all ?? 0;
    if (prev) prev.count += add;
    else map.set(key, { value: display, count: add });
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 10);
}

/* -------------------- types to avoid TS4111 -------------------- */
interface WhereBase {
  status?: string;
  AND?: any[];
}

/* -------------------- GET -------------------- */

export async function GET(req: NextRequest) {
  try {
    const parsed = parseQuery(req);
    const sp = req.nextUrl.searchParams;

    console.log(`[HF ${HF_VER}]`, req.nextUrl.toString(), parsed);

    const {
      mode, page, q, category, subcategory, brand, condition,
      featuredOnly, minPriceStr, maxPriceStr, sort, pageSize, facets, status,
    } = parsed;

    const skip = (page - 1) * pageSize;

    // ---------- Build WHEREs ----------
    const prodWhere: WhereBase = {};
    if (!status || status.toUpperCase() === "ACTIVE") prodWhere.status = "ACTIVE";
    else if (status.toUpperCase() !== "ALL") prodWhere.status = status.toUpperCase();

    const prodAnd: any[] = [];
    if (q) {
      prodAnd.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { brand: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
          { subcategory: { contains: q, mode: "insensitive" } },
          { sellerName: { contains: q, mode: "insensitive" } },
        ],
      });
    }
    if (category) prodAnd.push({ category: { equals: category, mode: "insensitive" } });
    if (subcategory) prodAnd.push({ subcategory: { equals: subcategory, mode: "insensitive" } });
    if (brand) prodAnd.push({ brand: { contains: brand, mode: "insensitive" } });
    if (condition) prodAnd.push({ condition: { equals: condition, mode: "insensitive" } });
    if (featuredOnly) prodAnd.push({ featured: true });

    if (sp.has("minPrice") || sp.has("maxPrice")) {
      const minPrice = minPriceStr !== null ? toInt(minPriceStr, 0, 0, 9_999_999) : undefined;
      const maxPrice = maxPriceStr !== null ? toInt(maxPriceStr, 9_999_999, 0, 9_999_999) : undefined;
      const priceClause: PriceClause = {};
      if (typeof minPrice === "number") priceClause.gte = minPrice;
      if (typeof maxPrice === "number") priceClause.lte = maxPrice;
      if (!minPrice || minPrice === 0) {
        prodAnd.push({ OR: [{ price: null }, { price: priceClause }] });
      } else {
        prodAnd.push({ price: priceClause });
      }
    }
    if (sort === "price_asc" || sort === "price_desc") prodAnd.push({ price: { not: null } });
    if (prodAnd.length) prodWhere.AND = prodAnd;

    // Services WHERE
    const svcWhere: WhereBase = {};
    if (!status || status.toUpperCase() === "ACTIVE") svcWhere.status = "ACTIVE";
    else if (status.toUpperCase() !== "ALL") svcWhere.status = status.toUpperCase();

    const svcAnd: any[] = [];
    if (q) {
      svcAnd.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
          { subcategory: { contains: q, mode: "insensitive" } },
          { seller: { is: { name: { contains: q, mode: "insensitive" } } } },
        ],
      });
    }
    if (category) svcAnd.push({ category: { equals: category, mode: "insensitive" } });
    if (subcategory) svcAnd.push({ subcategory: { equals: subcategory, mode: "insensitive" } });
    if (featuredOnly) svcAnd.push({ featured: true });
    if (sp.has("minPrice") || sp.has("maxPrice")) {
      const minPrice = minPriceStr !== null ? toInt(minPriceStr, 0, 0, 9_999_999) : undefined;
      const maxPrice = maxPriceStr !== null ? toInt(maxPriceStr, 9_999_999, 0, 9_999_999) : undefined;
      const clause: PriceClause = {};
      if (typeof minPrice === "number") clause.gte = minPrice;
      if (typeof maxPrice === "number") clause.lte = maxPrice;
      if (!minPrice || minPrice === 0) {
        svcAnd.push({ OR: [{ price: null }, { price: clause }] });
      } else {
        svcAnd.push({ price: clause });
      }
    }
    if (sort === "price_asc" || sort === "price_desc") svcAnd.push({ price: { not: null } });
    if (svcAnd.length) svcWhere.AND = svcAnd;

    // ---------- Sort ----------
    const isSearchLike = !!(q || category || subcategory || brand);
    const prodOrderBy =
      sort === "price_asc" ? [{ price: "asc" as const }, { id: "desc" as const }] :
      sort === "price_desc" ? [{ price: "desc" as const }, { id: "desc" as const }] :
      sort === "featured" ? [{ featured: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }] :
      isSearchLike ? [{ featured: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }] :
                     [{ createdAt: "desc" as const }, { id: "desc" as const }];
    const svcOrderBy = prodOrderBy;

    const Service = getServiceModel();

    /* -------------------- t=products -------------------- */
    if (mode === "products") {
      const total = await prisma.product.count({ where: prodWhere as any });
      const rowsRaw = await prisma.product.findMany({
        where: prodWhere as any,
        select: {
          id: true, name: true, category: true, subcategory: true,
          price: true, image: true, location: true, featured: true, createdAt: true
        },
        orderBy: prodOrderBy,
        skip,
        take: pageSize,
      });
      const rows = rowsRaw as unknown as ProductRow[];

      const items: CombinedItem[] = rows.map((p): CombinedItem => ({
        type: "product",
        id: p.id,
        name: p.name,
        category: p.category ?? null,
        subcategory: p.subcategory ?? null,
        price: p.price ?? null,
        image: p.image ?? null,
        location: p.location ?? null,
        featured: !!p.featured,
        createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt ?? ""),
      }));

      let outFacets: any | undefined = undefined;
      if (facets) {
        try {
          const [catsRaw, brandsRaw, condsRaw] = await Promise.all([
            prisma.product.groupBy({ by: ["category"], where: prodWhere as any, _count: { _all: true } }),
            prisma.product.groupBy({ by: ["brand"], where: prodWhere as any, _count: { _all: true } }),
            prisma.product.groupBy({ by: ["condition"], where: prodWhere as any, _count: { _all: true } }),
          ]);
          outFacets = {
            categories: coalesceCaseInsensitive<CatRow>(catsRaw as any, (x: any) => x.category),
            brands: coalesceCaseInsensitive<BrandRow>(brandsRaw as any, (x: any) => x.brand),
            conditions: coalesceCaseInsensitive<CondRow>(condsRaw as any, (x: any) => x.condition),
          };
        } catch {/* ignore */}
      }

      return respond({
        mode, page, pageSize, total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        items, facets: outFacets
      });
    }

    /* -------------------- t=services -------------------- */
    if (mode === "services") {
      if (!Service) return respond({ mode, page, pageSize, total: 0, totalPages: 1, items: [] });

      const total = await Service.count({ where: svcWhere as any });
      const rowsRaw = await Service.findMany({
        where: svcWhere as any,
        select: {
          id: true, name: true, category: true, subcategory: true,
          price: true, image: true, location: true, featured: true, createdAt: true
        },
        orderBy: svcOrderBy,
        skip,
        take: pageSize,
      });
      const rows = rowsRaw as unknown as ServiceRow[];
      const items: CombinedItem[] = rows.map((s): CombinedItem => ({
        type: "service",
        id: s.id,
        name: s.name,
        category: s.category ?? null,
        subcategory: s.subcategory ?? null,
        price: s.price ?? null,
        image: s.image ?? null,
        location: s.location ?? null,
        featured: !!s.featured,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt ?? ""),
      }));

      let outFacets: any | undefined = undefined;
      if (facets) {
        try {
          const [catsRaw, subsRaw] = await Promise.all([
            Service.groupBy({ by: ["category"], where: svcWhere as any, _count: { _all: true } }),
            Service.groupBy({ by: ["subcategory"], where: svcWhere as any, _count: { _all: true } }),
          ]);
          outFacets = {
            categories: coalesceCaseInsensitive<CatRow>(catsRaw as any, (x: any) => x.category ?? null),
            subcategories: coalesceCaseInsensitive<SubcatRow>(subsRaw as any, (x: any) => x.subcategory ?? null),
          };
        } catch {/* ignore */}
      }

      return respond({
        mode, page, pageSize, total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        items, facets: outFacets
      });
    }

    /* -------------------- t=all (merged, real pagination) -------------------- */
    const ServiceForAll = getServiceModel();

    const [prodTotal, svcTotal] = await Promise.all([
      prisma.product.count({ where: prodWhere as any }),
      ServiceForAll ? ServiceForAll.count({ where: svcWhere as any }) : Promise.resolve(0),
    ]);
    const total = prodTotal + svcTotal;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    // Fetch up to the *end* of the requested page from each, then merge/slice
    const takeForMerge = page * pageSize;
    const [prodRowsRaw, svcRowsRaw] = await Promise.all([
      prisma.product.findMany({
        where: prodWhere as any,
        select: {
          id: true, name: true, category: true, subcategory: true,
          price: true, image: true, location: true, featured: true, createdAt: true
        },
        orderBy: prodOrderBy,
        take: takeForMerge,
      }),
      (ServiceForAll
        ? ServiceForAll.findMany({
            where: svcWhere as any,
            select: {
              id: true, name: true, category: true, subcategory: true,
              price: true, image: true, location: true, featured: true, createdAt: true
            },
            orderBy: svcOrderBy,
            take: takeForMerge,
          })
        : Promise.resolve([] as ServiceRow[])
      ),
    ]);

    const prodItems: CombinedItem[] = (prodRowsRaw as ProductRow[]).map((p) => ({
      type: "product",
      id: p.id,
      name: p.name,
      category: p.category ?? null,
      subcategory: p.subcategory ?? null,
      price: p.price ?? null,
      image: p.image ?? null,
      location: p.location ?? null,
      featured: !!p.featured,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt ?? ""),
    }));
    const svcItems: CombinedItem[] = (svcRowsRaw as ServiceRow[]).map((s) => ({
      type: "service",
      id: s.id,
      name: s.name,
      category: s.category ?? null,
      subcategory: s.subcategory ?? null,
      price: s.price ?? null,
      image: s.image ?? null,
      location: s.location ?? null,
      featured: !!s.featured,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt ?? ""),
    }));

    const mergedSorted = [...prodItems, ...svcItems].sort((a, b) => {
      const at = Date.parse(a.createdAt) || 0;
      const bt = Date.parse(b.createdAt) || 0;
      if (bt !== at) return bt - at;
      return String(b.id).localeCompare(String(a.id));
    });

    const start = (page - 1) * pageSize;
    const end = page * pageSize;
    const items = mergedSorted.slice(start, end);

    return respond({ mode: "all", page, pageSize, total, totalPages, items });
  } catch (e: any) {
    console.error("[home-feed GET] error", e);
    return respond({ error: e?.message || "Server error" }, { status: 500 });
  }
}

/* -------------------- OPTIONS (CORS) -------------------- */

export function OPTIONS() {
  const origin =
    process.env["NEXT_PUBLIC_APP_URL"] ??
    process.env["NEXT_PUBLIC_APP_URL"] ??
    "*";
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
