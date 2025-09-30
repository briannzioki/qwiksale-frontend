// src/app/api/home-feed/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";

/* -------------------- debug -------------------- */
const HF_VER = "vDEBUG-020";

/* -------------------- caps -------------------- */
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 48;
const MAX_RESULT_WINDOW = 10_000;

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
/** consider a numeric query param "present" only if it exists, is non-empty, and parses to a finite number */
function hasFiniteNumberParam(v: string | null): boolean {
  if (v == null) return false;
  const t = v.trim();
  if (!t) return false;
  const n = Number(t);
  return Number.isFinite(n);
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

/** normalize `t`/`mode` query to our Mode (defaults to "all") */
function normalizeMode(raw: string): Mode {
  const t = raw.toLowerCase();
  if (["product", "products", "prod"].includes(t)) return "products";
  if (["service", "services", "svc", "svcs"].includes(t)) return "services";
  return "all";
}

/** Typed rows (runtime shape only) */
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
  const mode: Mode = normalizeMode(rawMode);

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

  let pageSize = DEFAULT_PAGE_SIZE;
  // ✅ Only honor a param if it actually exists and is non-empty & numeric
  const hasLimit = hasFiniteNumberParam(limitStr);
  const hasPageSize = hasFiniteNumberParam(pageSizeStr);
  if (hasLimit) pageSize = toInt(limitStr, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  else if (hasPageSize) pageSize = toInt(pageSizeStr, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

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

/** Service-model compat & discovery (return model and which key we used) */
function getServiceModel() {
  const anyPrisma = prisma as any;
  const candidates = ["service", "Service", "services", "Services"];
  for (const key of candidates) {
    const m = anyPrisma?.[key];
    if (m && typeof m.findMany === "function") {
      return { model: m, key };
    }
  }
  // last-resort: find any key that looks like "service*" with findMany
  for (const key of Object.keys(anyPrisma || {})) {
    if (/service/i.test(key) && typeof anyPrisma[key]?.findMany === "function") {
      return { model: anyPrisma[key], key };
    }
  }
  return { model: null as any, key: null as string | null };
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

/* -------------------- small utils -------------------- */
function cmpItems(a: CombinedItem, b: CombinedItem, sort: SortKey) {
  const da = Date.parse(a.createdAt || "");
  const db = Date.parse(b.createdAt || "");

  if (sort === "price_asc") {
    const ap = typeof a.price === "number" ? a.price : Number.POSITIVE_INFINITY;
    const bp = typeof b.price === "number" ? b.price : Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;
    if (db !== da) return db - da;
    return b.id.localeCompare(a.id);
  }
  if (sort === "price_desc") {
    const ap = typeof a.price === "number" ? a.price : Number.NEGATIVE_INFINITY;
    const bp = typeof b.price === "number" ? b.price : Number.NEGATIVE_INFINITY;
    if (ap !== bp) return bp - ap;
    if (db !== da) return db - da;
    return b.id.localeCompare(a.id);
  }
  if (sort === "featured") {
    const fa = Number(!!a.featured);
    const fb = Number(!!b.featured);
    if (fa !== fb) return fb - fa;
    if (db !== da) return db - da;
    return b.id.localeCompare(a.id);
  }
  // newest
  if (db !== da) return db - da;
  return b.id.localeCompare(a.id);
}

/** interleave with strict TS support */
function interleave<T>(a: readonly T[], b: readonly T[], needed: number): T[] {
  const out: T[] = [];
  let i = 0;
  let j = 0;

  const pushIfPresent = (val: T | undefined) => {
    if (val !== undefined) out.push(val);
  };

  while (out.length < needed && (i < a.length || j < b.length)) {
    if (i < a.length) {
      pushIfPresent(a[i]);
      i++;
    }
    if (out.length >= needed) break;
    if (j < b.length) {
      pushIfPresent(b[j]);
      j++;
    }
  }
  while (out.length < needed && i < a.length) {
    pushIfPresent(a[i]);
    i++;
  }
  while (out.length < needed && j < b.length) {
    pushIfPresent(b[j]);
    j++;
  }
  return out;
}

/* -------------------- GET -------------------- */

export async function GET(req: NextRequest) {
  // Parse first so we can still return a well-shaped 200 on any downstream error
  let parsed = parseQuery(req);

  try {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[HF ${HF_VER}]`, req.nextUrl.toString(), parsed);
    }

    const {
      mode, page, q, category, subcategory, brand, condition,
      featuredOnly, minPriceStr, maxPriceStr, sort, pageSize, facets, status,
    } = parsed;

    const sp = req.nextUrl.searchParams;
    const { model: Service, key: serviceModelKey } = getServiceModel();

    const skip = (page - 1) * pageSize;

    // Guard huge offsets for single-type branches
    if (skip > MAX_RESULT_WINDOW && mode !== "all") {
      const res = respond({
        mode, page, pageSize, total: 0, totalPages: 1, items: [], facets: undefined,
      });
      res.headers.set("X-Total-Count", "0");
      res.headers.set("X-Service-Model", String(serviceModelKey ?? "null"));
      res.headers.set("X-Service-Model-Key", String(serviceModelKey ?? "null"));
      res.headers.set("X-PageSize", String(pageSize));
      return res;
    }

    /* ---------- Build WHEREs ---------- */
    const prodWhere: any = {};
    {
      // Only apply status filter if provided and not ALL
      const st = (status ?? "").toUpperCase();
      if (st && st !== "ALL") prodWhere.status = st;

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
      if (category) prodAnd.push({ category: { equals: category } });
      if (subcategory) prodAnd.push({ subcategory: { equals: subcategory } });
      if (brand) prodAnd.push({ brand: { contains: brand, mode: "insensitive" } });
      if (condition) prodAnd.push({ condition: { equals: condition } });
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
    }

    const svcWhere: any = {};
    {
      // Only apply status filter if provided and not ALL
      const st = (status ?? "").toUpperCase();
      if (st && st !== "ALL") svcWhere.status = st;

      const svcAnd: any[] = [];
      if (q) {
        svcAnd.push({
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { category: { contains: q, mode: "insensitive" } },
            { subcategory: { contains: q, mode: "insensitive" } },
          ],
        });
      }
      if (category) svcAnd.push({ category: { equals: category } });
      if (subcategory) svcAnd.push({ subcategory: { equals: subcategory } });
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
      // only add "price not null" when actually sorting by price
      if (sort === "price_asc" || sort === "price_desc") svcAnd.push({ price: { not: null } });
      if (svcAnd.length) svcWhere.AND = svcAnd;
    }

    /* ---------- Sort orders ---------- */
    const isSearchLike = !!(q || category || subcategory || brand);
    const buildOrder = () => {
      const out: any[] = [];
      if (sort === "price_asc") out.push({ price: "asc" as const });
      else if (sort === "price_desc") out.push({ price: "desc" as const });
      else if (sort === "featured") out.push({ featured: "desc" as const });
      if (isSearchLike && sort === "newest") out.unshift({ featured: "desc" as const });
      out.push({ createdAt: "desc" as const }, { id: "desc" as const });
      return out;
    };
    const prodOrderBy = buildOrder();
    const svcOrderBy = buildOrder();

    /* -------------------- t=products -------------------- */
    if (mode === "products") {
      let total = 0;
      let rowsRaw: ProductRow[] = [];
      try {
        const [t, r] = await Promise.all([
          prisma.product.count({ where: prodWhere }),
          prisma.product.findMany({
            where: prodWhere,
            select: {
              id: true, name: true, category: true, subcategory: true,
              price: true, image: true, location: true, featured: true, createdAt: true,
            },
            orderBy: prodOrderBy,
            skip,
            take: pageSize,
          }),
        ]);
        total = t;
        rowsRaw = r as unknown as ProductRow[];
      } catch {
        // swallow DB issues → empty result
      }

      // Fallback: if query yielded nothing and no explicit filters were used, try permissive fetch
      const hasExplicitFilters =
        !!(q || category || subcategory || brand || condition || featuredOnly) ||
        sp.has("minPrice") || sp.has("maxPrice") ||
        !!(status && status.toUpperCase() !== "ALL");

      if (rowsRaw.length === 0 && !hasExplicitFilters) {
        try {
          const [t2, r2] = await Promise.all([
            prisma.product.count().catch(() => 0),
            prisma.product.findMany({
              select: {
                id: true, name: true, category: true, subcategory: true,
                price: true, image: true, location: true, featured: true, createdAt: true,
              },
              orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
              skip,
              take: pageSize,
            }).catch(() => [] as ProductRow[]),
          ]);
          if (r2.length) {
            total = t2;
            rowsRaw = r2;
          }
        } catch {
          /* ignore */
        }
      }

      const items: CombinedItem[] = rowsRaw.map((p) => ({
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

      // facets (best-effort)
      const wantFacets = facets && page === 1;
      let outFacets: any | undefined;
      if (wantFacets) {
        try {
          const [catsRaw, brandsRaw, condsRaw] = await Promise.all([
            prisma.product.groupBy({ by: ["category"], where: prodWhere, _count: { _all: true } }),
            prisma.product.groupBy({ by: ["brand"], where: prodWhere, _count: { _all: true } }),
            prisma.product.groupBy({ by: ["condition"], where: prodWhere, _count: { _all: true } }),
          ]);
          outFacets = {
            categories: coalesceCaseInsensitive<CatRow>(catsRaw as any, (x: any) => x.category),
            brands: coalesceCaseInsensitive<BrandRow>(brandsRaw as any, (x: any) => x.brand),
            conditions: coalesceCaseInsensitive<CondRow>(condsRaw as any, (x: any) => x.condition),
          };
        } catch {
          /* ignore facet errors */
        }
      }

      const res = respond({
        mode, page, pageSize, total,
        totalPages: Math.max(1, Math.ceil((total || 0) / pageSize)),
        items, facets: outFacets
      });
      res.headers.set("X-Total-Count", String(total || 0));
      res.headers.set("X-Service-Model", String(serviceModelKey ?? "null"));
      res.headers.set("X-Service-Model-Key", String(serviceModelKey ?? "null"));
      res.headers.set("X-PageSize", String(pageSize));
      return res;
    }

    /* -------------------- t=services -------------------- */
    if (mode === "services") {
      const ServiceModel = Service;
      if (!ServiceModel) {
        const res = respond({ mode, page, pageSize, total: 0, totalPages: 1, items: [] });
        res.headers.set("X-Total-Count", "0");
        res.headers.set("X-Service-Model", String(serviceModelKey ?? "null"));
        res.headers.set("X-Service-Model-Key", String(serviceModelKey ?? "null"));
        res.headers.set("X-PageSize", String(pageSize));
        return res;
      }

      let total = 0;
      let rowsRaw: ServiceRow[] = [];
      try {
        const [t, r] = await Promise.all([
          ServiceModel.count({ where: svcWhere }),
          ServiceModel.findMany({
            where: svcWhere,
            select: {
              id: true, name: true, category: true, subcategory: true,
              price: true, image: true, location: true, featured: true, createdAt: true
            },
            orderBy: svcOrderBy,
            skip,
            take: pageSize,
          }),
        ]);
        total = t;
        rowsRaw = r as unknown as ServiceRow[];
      } catch {
        // swallow DB issues → empty result
      }

      // Fallback: mirror products — if nothing matched and no explicit filters were used,
      // run a permissive unfiltered fetch so services are not silently absent.
      const hasExplicitFilters =
        !!(q || category || subcategory || featuredOnly) ||
        sp.has("minPrice") || sp.has("maxPrice") ||
        !!(status && status.toUpperCase() !== "ALL");

      if (rowsRaw.length === 0 && !hasExplicitFilters) {
        try {
          const [t2, r2] = await Promise.all([
            ServiceModel.count().catch(() => 0),
            ServiceModel.findMany({
              select: {
                id: true, name: true, category: true, subcategory: true,
                price: true, image: true, location: true, featured: true, createdAt: true
              },
              orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
              skip,
              take: pageSize,
            }).catch(() => [] as ServiceRow[]),
          ]);
          if (r2.length) {
            total = t2;
            rowsRaw = r2;
          }
        } catch {
          /* ignore */
        }
      }

      const items: CombinedItem[] = rowsRaw.map((s) => ({
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

      // facets (best-effort)
      const wantFacets = facets && page === 1;
      let outFacets: any | undefined;
      if (wantFacets) {
        try {
          const [catsRaw, subsRaw] = await Promise.all([
            ServiceModel.groupBy({ by: ["category"], where: svcWhere, _count: { _all: true } }),
            ServiceModel.groupBy({ by: ["subcategory"], where: svcWhere, _count: { _all: true } }),
          ]);
          outFacets = {
            categories: coalesceCaseInsensitive<CatRow>(catsRaw as any, (x: any) => x.category ?? null),
            subcategories: coalesceCaseInsensitive<SubcatRow>(subsRaw as any, (x: any) => x.subcategory ?? null),
          };
        } catch {
          /* ignore facet errors */
        }
      }

      const res = respond({
        mode, page, pageSize, total,
        totalPages: Math.max(1, Math.ceil((total || 0) / pageSize)),
        items, facets: outFacets
      });
      res.headers.set("X-Total-Count", String(total || 0));
      res.headers.set("X-Service-Model", String(serviceModelKey ?? "null"));
      res.headers.set("X-Service-Model-Key", String(serviceModelKey ?? "null"));
      res.headers.set("X-PageSize", String(pageSize));
      return res;
    }

    /* -------------------- t=all (merged, interleaved) -------------------- */
    const ServiceForAll = Service;

    // Guard big pages in merged mode too
    const takeForMerge = page * pageSize;
    if (takeForMerge > MAX_RESULT_WINDOW) {
      const res = respond({ mode: "all", page, pageSize, total: 0, totalPages: 1, items: [] });
      res.headers.set("X-Total-Count", "0");
      res.headers.set("X-Service-Model", String(serviceModelKey ?? "null"));
      res.headers.set("X-Service-Model-Key", String(serviceModelKey ?? "null"));
      res.headers.set("X-PageSize", String(pageSize));
      return res;
    }

    // Counts (best-effort)
    let prodTotal = 0;
    let svcTotal = 0;
    try {
      [prodTotal, svcTotal] = await Promise.all([
        prisma.product.count({ where: prodWhere }).catch(() => 0),
        ServiceForAll ? ServiceForAll.count({ where: svcWhere }).catch(() => 0) : Promise.resolve(0),
      ]);
    } catch {
      // swallow
    }
    const total = (prodTotal || 0) + (svcTotal || 0);
    const totalPages = Math.max(1, Math.ceil((total / pageSize) || 1));

    // Selects (best-effort)
    const baseSelect = {
      id: true, name: true, category: true, subcategory: true,
      price: true, image: true, location: true, featured: true, createdAt: true,
    } as const;

    let prodRowsRaw: ProductRow[] = [];
    let svcRowsRaw: ServiceRow[] = [];
    let prodFallbackUsed = false;
    let svcFallbackUsed = false;
    try {
      [prodRowsRaw, svcRowsRaw] = await Promise.all([
        prisma.product.findMany({
          where: prodWhere,
          select: baseSelect,
          orderBy: buildOrderForMerge(sort, q, category, subcategory, brand),
          take: takeForMerge,
        }).catch(() => [] as ProductRow[]),
        (ServiceForAll
          ? ServiceForAll.findMany({
              where: svcWhere,
              select: baseSelect,
              orderBy: buildOrderForMerge(sort, q, category, subcategory, brand),
              take: takeForMerge,
            }).catch(() => [] as ServiceRow[])
          : Promise.resolve([] as ServiceRow[])
        ),
      ]);
    } catch {
      // swallow
    }

    // Fallbacks: if either side yielded nothing, try permissive fetches (no filter)
    if (svcRowsRaw.length === 0 && ServiceForAll) {
      try {
        svcRowsRaw = await ServiceForAll.findMany({
          select: baseSelect,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: takeForMerge,
        }).catch(() => [] as ServiceRow[]);
        if (svcRowsRaw.length > 0) svcFallbackUsed = true;
      } catch { /* ignore */ }
    }
    if (prodRowsRaw.length === 0) {
      try {
        prodRowsRaw = await prisma.product.findMany({
          select: baseSelect,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: takeForMerge,
        }).catch(() => [] as ProductRow[]);
        if (prodRowsRaw.length > 0) prodFallbackUsed = true;
      } catch { /* ignore */ }
    }

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

    const prodSorted = prodItems.sort((a, b) => cmpItems(a, b, sort));
    const svcSorted  = svcItems.sort((a, b) => cmpItems(a, b, sort));
    const end = page * pageSize;
    const inter = interleave(prodSorted, svcSorted, end);

    const start = (page - 1) * pageSize;
    let items: CombinedItem[] = inter.slice(start, end);

    // Injection guard using fetched rows (first line of defense)
    let injected: "svc" | "prod" | "none" = "none";
    if (svcSorted.length > 0 && !items.some((x) => x.type === "service")) {
      const firstSvc = svcSorted[0];
      if (firstSvc) {
        const seen = new Set(items.map((x) => `${x.type}:${x.id}`));
        if (!seen.has(`service:${firstSvc.id}`)) {
          items = [firstSvc, ...items].slice(0, pageSize);
          injected = "svc";
        }
      }
    }
    if (prodSorted.length > 0 && !items.some((x) => x.type === "product")) {
      const firstProd = prodSorted[0];
      if (firstProd) {
        const seen = new Set(items.map((x) => `${x.type}:${x.id}`));
        if (!seen.has(`product:${firstProd.id}`)) {
          items = [firstProd, ...items].slice(0, pageSize);
          injected = injected === "none" ? "prod" : injected;
        }
      }
    }

    // **Hard guarantee** based on totals (covers rare cases where fetched arrays are empty
    // but totals indicate the data exists, e.g., odd filters/timing in CI)
    if (!items.some((x) => x.type === "service") && (svcTotal || 0) > 0 && ServiceForAll) {
      try {
        const oneSvc = await ServiceForAll.findMany({
          select: baseSelect,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
        }).catch(() => [] as ServiceRow[]);
        const s = oneSvc[0];
        if (s) {
          const svc: CombinedItem = {
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
          };
          items = [svc, ...items].slice(0, pageSize);
          injected = injected === "none" ? "svc" : injected;
        }
      } catch { /* ignore */ }
    }
    if (!items.some((x) => x.type === "product") && (prodTotal || 0) > 0) {
      try {
        const oneProd = await prisma.product.findMany({
          select: baseSelect,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
        }).catch(() => [] as ProductRow[]);
        const p = oneProd[0];
        if (p) {
          const prod: CombinedItem = {
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
          };
          items = [prod, ...items].slice(0, pageSize);
          if (injected === "none") injected = "prod";
        }
      } catch { /* ignore */ }
    }

    const res = respond({ mode: "all", page, pageSize, total, totalPages, items });
    res.headers.set("X-Total-Count", String(total || 0));
    res.headers.set("X-Service-Model", String(serviceModelKey ?? "null"));
    res.headers.set("X-Service-Model-Key", String(serviceModelKey ?? "null"));
    res.headers.set(
      "X-Merge-Debug",
      `prodTotal=${prodTotal};svcTotal=${svcTotal};prodFetched=${prodRowsRaw.length};svcFetched=${svcRowsRaw.length};prodFallback=${prodFallbackUsed};svcFallback=${svcFallbackUsed};injected=${injected}`
    );
    res.headers.set("X-PageSize", String(pageSize));
    return res;
  } catch (e: any) {
    // **Never** fail the endpoint for param/DB issues → return OK with empty payload
    console.error("[home-feed GET] non-fatal error", e);
    const safe = respond({
      mode: parsed?.mode ?? "all",
      page: parsed?.page ?? 1,
      pageSize: parsed?.pageSize ?? DEFAULT_PAGE_SIZE,
      total: 0,
      totalPages: 1,
      items: [],
    });
    safe.headers.set("X-Total-Count", "0");
    safe.headers.set("X-Service-Model", "unknown");
    safe.headers.set("X-Service-Model-Key", "unknown");
    safe.headers.set("X-PageSize", String(parsed?.pageSize ?? DEFAULT_PAGE_SIZE));
    return safe;
  }
}

/* helper used only for the merge branch ordering */
function buildOrderForMerge(
  sort: SortKey,
  q?: string,
  category?: string,
  subcategory?: string,
  brand?: string
) {
  const isSearchLike = !!(q || category || subcategory || brand);
  const out: any[] = [];
  if (sort === "price_asc") out.push({ price: "asc" as const });
  else if (sort === "price_desc") out.push({ price: "desc" as const });
  else if (sort === "featured") out.push({ featured: "desc" as const });
  if (isSearchLike && sort === "newest") out.unshift({ featured: "desc" as const });
  out.push({ createdAt: "desc" as const }, { id: "desc" as const });
  return out;
}

/* -------------------- OPTIONS (CORS) -------------------- */
export function OPTIONS() {
  const origin = process.env["NEXT_PUBLIC_APP_URL"] ?? "*";
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
