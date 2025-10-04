// src/app/api/home-feed/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";

/* -------------------- debug -------------------- */
const HF_VER = "v1.0.1";

/* -------------------- helpers -------------------- */

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
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
  id: string; name?: string; title?: string;
  category?: string | null; subcategory?: string | null;
  price?: number | null; image?: string | null; location?: string | null;
  featured?: boolean | null; createdAt?: Date | string | null;
};
type ServiceRow = {
  id: string; name?: string; title?: string;
  category?: string | null; subcategory?: string | null;
  price?: number | null; image?: string | null; location?: string | null;
  featured?: boolean | null; createdAt?: Date | string | null;
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
  createdAt: string; // ISO
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

  // ⚠️ Fix: Only treat limit/pageSize as provided if not null/empty
  const hasLimit = limitStr !== null && limitStr !== "" && Number.isFinite(Number(limitStr));
  const hasPageSize = pageSizeStr !== null && pageSizeStr !== "" && Number.isFinite(Number(pageSizeStr));

  let pageSize = 24;
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

/* -------------------- tolerant builders & safety nets -------------------- */

function buildProductWhere(parsed: ReturnType<typeof parseQuery>, stage = 0): WhereBase {
  const {
    q, category, subcategory, brand, condition, featuredOnly,
    minPriceStr, maxPriceStr, sort, status
  } = parsed;

  const where: WhereBase = {};
  const s = status?.toUpperCase();
  if (!s || s === "ACTIVE") where.status = "ACTIVE";
  else if (s !== "ALL") where.status = s;

  const AND: any[] = [];

  if (stage <= 0 && q) {
    AND.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { subcategory: { contains: q, mode: "insensitive" } },
        { sellerName: { contains: q, mode: "insensitive" } },
      ],
    });
  } else if (stage >= 1 && q) {
    AND.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { subcategory: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (stage <= 1) {
    if (category) AND.push({ category: { equals: category, mode: "insensitive" } });
    if (subcategory) AND.push({ subcategory: { equals: subcategory, mode: "insensitive" } });
    if (brand) AND.push({ brand: { contains: brand, mode: "insensitive" } });
    if (condition) AND.push({ condition: { equals: condition, mode: "insensitive" } });
  } else if (stage === 2) {
    if (category) AND.push({ category: { equals: category, mode: "insensitive" } });
    if (subcategory) AND.push({ subcategory: { equals: subcategory, mode: "insensitive" } });
  }

  if (featuredOnly) AND.push({ featured: true });

  if (stage <= 1 && (minPriceStr !== null || maxPriceStr !== null)) {
    const minPrice = minPriceStr !== null ? toInt(minPriceStr, 0, 0, 9_999_999) : undefined;
    const maxPrice = maxPriceStr !== null ? toInt(maxPriceStr, 9_999_999, 0, 9_999_999) : undefined;
    const priceClause: PriceClause = {};
    if (typeof minPrice === "number") priceClause.gte = minPrice;
    if (typeof maxPrice === "number") priceClause.lte = maxPrice;
    if (!minPrice || minPrice === 0) {
      AND.push({ OR: [{ price: null }, { price: priceClause }] });
    } else {
      AND.push({ price: priceClause });
    }
  }
  if (sort === "price_asc" || sort === "price_desc") AND.push({ price: { not: null } });

  if (AND.length) where.AND = AND;
  return where;
}

function buildServiceWhere(parsed: ReturnType<typeof parseQuery>, stage = 0): WhereBase {
  const {
    q, category, subcategory, featuredOnly,
    minPriceStr, maxPriceStr, sort, status
  } = parsed;

  const where: WhereBase = {};
  const s = status?.toUpperCase();
  if (!s || s === "ACTIVE") where.status = "ACTIVE";
  else if (s !== "ALL") where.status = s;

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
  if (featuredOnly) AND.push({ featured: true });

  if (stage <= 1 && (minPriceStr !== null || maxPriceStr !== null)) {
    const minPrice = minPriceStr !== null ? toInt(minPriceStr, 0, 0, 9_999_999) : undefined;
    const maxPrice = maxPriceStr !== null ? toInt(maxPriceStr, 9_999_999, 0, 9_999_999) : undefined;
    const clause: PriceClause = {};
    if (typeof minPrice === "number") clause.gte = minPrice;
    if (typeof maxPrice === "number") clause.lte = maxPrice;
    if (!minPrice || minPrice === 0) {
      AND.push({ OR: [{ price: null }, { price: clause }] });
    } else {
      AND.push({ price: clause });
    }
  }
  if (sort === "price_asc" || sort === "price_desc") AND.push({ price: { not: null } });

  if (AND.length) where.AND = AND;
  return where;
}

function buildOrderByCandidates(sort: SortKey) {
  const priceAsc = [{ price: "asc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];
  const priceDesc = [{ price: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];
  const featured = [{ featured: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];
  const newest = [{ createdAt: "desc" as const }, { id: "desc" as const }];

  const primary =
    sort === "price_asc" ? priceAsc :
    sort === "price_desc" ? priceDesc :
    sort === "featured" ? featured :
    newest;

  return [
    primary,
    [{ createdAt: "desc" as const }, { id: "desc" as const }],
    [{ id: "desc" as const }],
    undefined,
  ];
}

function pickName(row: { name?: string; title?: string }) {
  return (row.name ?? row.title ?? "").toString().trim() || "Item";
}

function toIso(d?: Date | string | null) {
  if (!d) return "";
  if (d instanceof Date) return isNaN(d.getTime()) ? "" : d.toISOString();
  const ms = Date.parse(d);
  return isNaN(ms) ? "" : new Date(ms).toISOString();
}

function mapRowToItem<T extends ProductRow | ServiceRow>(
  type: CombinedItem["type"],
  r: T
): CombinedItem {
  return {
    type,
    id: String((r as any).id),
    name: pickName(r),
    category: (r.category ?? null) as any,
    subcategory: (r.subcategory ?? null) as any,
    price: (typeof r.price === "number" ? r.price : null),
    image: (r.image ?? null) as any,
    location: (r.location ?? null) as any,
    featured: Boolean(r.featured),
    createdAt: toIso(r.createdAt) || "1970-01-01T00:00:00.000Z",
  };
}

/* -------------------- GET -------------------- */

export async function GET(req: NextRequest) {
  try {
    const parsed = parseQuery(req);

    console.log(`[HF ${HF_VER}]`, req.nextUrl.pathname, Object.fromEntries(req.nextUrl.searchParams));

    const { mode, page, sort, pageSize, facets } = parsed;
    const skip = (page - 1) * pageSize;

    const Service = getServiceModel();

    /* -------------------- t=products -------------------- */
    if (mode === "products") {
      const prodWhereCandidates = [
        buildProductWhere(parsed, 0),
        buildProductWhere(parsed, 1),
        buildProductWhere(parsed, 2),
        {} as WhereBase,
      ];

      let workingProdWhere: any = prodWhereCandidates[prodWhereCandidates.length - 1];
      for (const w of prodWhereCandidates) {
        try {
          await prisma.product.count({ where: w as any });
          workingProdWhere = w;
          break;
        } catch {}
      }

      const productSelectCandidates: any[] = [
        { id: true, name: true, category: true, subcategory: true, price: true, image: true, location: true, featured: true, createdAt: true },
        { id: true, title: true, category: true, subcategory: true, price: true, image: true, location: true, featured: true, createdAt: true },
        { id: true, name: true, price: true, image: true, featured: true, createdAt: true },
        { id: true, title: true, price: true, image: true, featured: true, createdAt: true },
        { id: true, name: true, createdAt: true },
        { id: true, title: true, createdAt: true },
        { id: true, name: true },
        { id: true, title: true },
        { id: true },
      ];

      const orderByCandidates = buildOrderByCandidates(sort);

      let rowsRaw: any[] = [];
      let total = 0;

      try {
        total = await prisma.product.count({ where: workingProdWhere as any });
      } catch { total = 0; }

      outerProducts:
      for (const select of productSelectCandidates) {
        for (const orderBy of orderByCandidates) {
          try {
            rowsRaw = await (prisma as any).product.findMany({
              where: workingProdWhere,
              select,
              orderBy,
              skip,
              take: pageSize,
            });
            break outerProducts;
          } catch {}
        }
      }

      const rows = rowsRaw as ProductRow[];
      const items: CombinedItem[] = rows.map((p) => mapRowToItem("product", p));

      let outFacets: any | undefined = undefined;
      if (facets) {
        try {
          const [catsRaw, brandsRaw, condsRaw] = await Promise.all([
            (prisma as any).product.groupBy({ by: ["category"], where: workingProdWhere as any, _count: { _all: true } }),
            (prisma as any).product.groupBy({ by: ["brand"], where: workingProdWhere as any, _count: { _all: true } }),
            (prisma as any).product.groupBy({ by: ["condition"], where: workingProdWhere as any, _count: { _all: true } }),
          ]);
          outFacets = {
            categories: coalesceCaseInsensitive<CatRow>(catsRaw as any, (x: any) => x.category),
            brands: coalesceCaseInsensitive<BrandRow>(brandsRaw as any, (x: any) => x.brand),
            conditions: coalesceCaseInsensitive<CondRow>(condsRaw as any, (x: any) => x.condition),
          };
        } catch {}
      }

      return respond({
        mode, page, pageSize, total,
        totalPages: Math.max(1, Math.ceil(total / Math.max(1, pageSize))),
        items, facets: outFacets
      });
    }

    /* -------------------- t=services -------------------- */
    if (mode === "services") {
      if (!Service) {
        return respond({ mode, page, pageSize, total: 0, totalPages: 1, items: [] });
      }

      const svcWhereCandidates = [
        buildServiceWhere(parsed, 0),
        buildServiceWhere(parsed, 1),
        {} as WhereBase,
      ];

      let workingSvcWhere: any = svcWhereCandidates[svcWhereCandidates.length - 1];
      for (const w of svcWhereCandidates) {
        try {
          await Service.count({ where: w as any });
          workingSvcWhere = w;
          break;
        } catch {}
      }

      const serviceSelectCandidates: any[] = [
        { id: true, name: true, title: true, category: true, subcategory: true, price: true, image: true, location: true, featured: true, createdAt: true },
        { id: true, name: true, category: true, subcategory: true, price: true, image: true, location: true, featured: true, createdAt: true },
        { id: true, title: true, category: true, subcategory: true, price: true, image: true, location: true, featured: true, createdAt: true },
        { id: true, name: true, price: true, image: true, featured: true, createdAt: true },
        { id: true, title: true, price: true, image: true, featured: true, createdAt: true },
        { id: true, name: true, createdAt: true },
        { id: true, title: true, createdAt: true },
        { id: true, name: true },
        { id: true, title: true },
        { id: true },
      ];

      const orderByCandidates = buildOrderByCandidates(sort);

      let rowsRaw: any[] = [];
      let total = 0;

      try {
        total = await Service.count({ where: workingSvcWhere as any });
      } catch { total = 0; }

      outerServices:
      for (const select of serviceSelectCandidates) {
        for (const orderBy of orderByCandidates) {
          try {
            rowsRaw = await Service.findMany({
              where: workingSvcWhere as any,
              select,
              orderBy,
              skip,
              take: pageSize,
            });
            break outerServices;
          } catch {}
        }
      }

      const rows = rowsRaw as ServiceRow[];
      const items: CombinedItem[] = rows.map((s) => mapRowToItem("service", s));

      let outFacets: any | undefined = undefined;
      if (facets) {
        try {
          const [catsRaw, subsRaw] = await Promise.all([
            Service.groupBy({ by: ["category"], where: workingSvcWhere as any, _count: { _all: true } }),
            Service.groupBy({ by: ["subcategory"], where: workingSvcWhere as any, _count: { _all: true } }),
          ]);
          outFacets = {
            categories: coalesceCaseInsensitive<CatRow>(catsRaw as any, (x: any) => x.category ?? null),
            subcategories: coalesceCaseInsensitive<SubcatRow>(subsRaw as any, (x: any) => x.subcategory ?? null),
          };
        } catch {}
      }

      return respond({
        mode, page, pageSize, total,
        totalPages: Math.max(1, Math.ceil(total / Math.max(1, pageSize))),
        items, facets: outFacets
      });
    }

    /* -------------------- t=all (merged) -------------------- */
    const ServiceForAll = Service;

    const prodWhereForAll = buildProductWhere(parsed, 1);
    const svcWhereForAll = buildServiceWhere(parsed, 1);

    const [prodTotal, svcTotal] = await Promise.all([
      (async () => { try { return await prisma.product.count({ where: prodWhereForAll as any }); } catch { return 0; } })(),
      (async () => { try { return ServiceForAll ? await ServiceForAll.count({ where: svcWhereForAll as any }) : 0; } catch { return 0; } })(),
    ]);
    const total = prodTotal + svcTotal;
    const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));

    const takeForMerge = page * pageSize;

    const productSelectForAll: any[] = [
      { id: true, name: true, title: true, category: true, subcategory: true, price: true, image: true, location: true, featured: true, createdAt: true },
      { id: true, name: true, price: true, image: true, featured: true, createdAt: true },
      { id: true, title: true, price: true, image: true, featured: true, createdAt: true },
      { id: true, name: true, createdAt: true },
      { id: true, title: true, createdAt: true },
      { id: true },
    ];
    const serviceSelectForAll: any[] = [
      { id: true, name: true, title: true, category: true, subcategory: true, price: true, image: true, location: true, featured: true, createdAt: true },
      { id: true, name: true, price: true, image: true, featured: true, createdAt: true },
      { id: true, title: true, price: true, image: true, featured: true, createdAt: true },
      { id: true, name: true, createdAt: true },
      { id: true, title: true, createdAt: true },
      { id: true },
    ];

    const orderByCandidates = buildOrderByCandidates(sort);

    let prodRowsRaw: any[] = [];
    let svcRowsRaw: any[] = [];

    outerProdAll:
    for (const select of productSelectForAll) {
      for (const orderBy of orderByCandidates) {
        try {
          prodRowsRaw = await (prisma as any).product.findMany({
            where: prodWhereForAll as any,
            select,
            orderBy,
            take: takeForMerge,
          });
          break outerProdAll;
        } catch {}
      }
    }

    if (ServiceForAll) {
      outerSvcAll:
      for (const select of serviceSelectForAll) {
        for (const orderBy of orderByCandidates) {
          try {
            svcRowsRaw = await ServiceForAll.findMany({
              where: svcWhereForAll as any,
              select,
              orderBy,
              take: takeForMerge,
            });
            break outerSvcAll;
          } catch {}
        }
      }
    }

    const prodItems: CombinedItem[] = (prodRowsRaw as ProductRow[]).map((p) => mapRowToItem("product", p));
    const svcItems: CombinedItem[] = (svcRowsRaw as ServiceRow[]).map((s) => mapRowToItem("service", s));

    const merged = [...prodItems, ...svcItems];
    const cmp = (a: CombinedItem, b: CombinedItem) => {
      if (sort === "price_asc" || sort === "price_desc") {
        const av = a.price ?? (sort === "price_asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
        const bv = b.price ?? (sort === "price_asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
        if (av !== bv) return sort === "price_asc" ? av - bv : bv - av;
        const af = (a.featured ? 1 : 0) - (b.featured ? 1 : 0);
        if (af !== 0) return -af;
      } else if (sort === "featured") {
        const af = (a.featured ? 1 : 0) - (b.featured ? 1 : 0);
        if (af !== 0) return -af;
      }
      const at = Date.parse(a.createdAt) || 0;
      const bt = Date.parse(b.createdAt) || 0;
      if (bt !== at) return bt - at;
      return String(b.id).localeCompare(String(a.id));
    };

    const mergedSorted = merged.sort(cmp);
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
    process.env["APP_ORIGIN"] ??
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
