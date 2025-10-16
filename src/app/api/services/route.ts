// src/app/api/services/route.ts
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { jsonPublic, jsonPrivate } from "@/app/api/_lib/responses";

/* ----------------------------- debug ----------------------------- */
const SERVICES_VER = "vDEBUG-SERVICES-011";
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
function toInt(v: string | null | undefined, def: number, min: number, max: number) {
  if (v == null || v.trim() === "") return def; // treat null/blank as unset
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

/* ------------------------- search variants ------------------------- */
// Removed "title" so we never reference a non-existent column
type SearchField = "name" | "description" | "category" | "subcategory";

/** Try richer → safer. */
const SEARCH_FIELD_VARIANTS: SearchField[][] = [
  ["name", "description", "category", "subcategory"],
  ["name", "category", "subcategory"],
  ["name", "description"],
  ["name"],
];

function buildSearchAND(tokens: string[], rawQ: string, fields: SearchField[]) {
  const makeOr = (needle: string) =>
    ({
      OR: fields.map((f) => ({ [f]: { contains: needle, mode: "insensitive" } })),
    } as any);

  const AND: any[] = [];
  if (tokens.length > 0) {
    for (const t of tokens) AND.push(makeOr(t));
  } else if (rawQ) {
    AND.push(makeOr(rawQ));
  }
  return AND;
}

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

    const rawQ = (url.searchParams.get("q") || "").trim().slice(0, 64);
    const tokens = rawQ.split(/\s+/).map((s) => s.trim()).filter((s) => s.length > 1).slice(0, 5);

    const category = optStr(url.searchParams.get("category"));
    const subcategory = optStr(url.searchParams.get("subcategory"));

    // Ownership filters
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
      sellerId = uid;
    }

    // Resolve username → id (best-effort; case-insensitive)
    if (!sellerId && sellerUsername) {
      try {
        const u = await prisma.user.findFirst({
          where: { username: { equals: sellerUsername, mode: "insensitive" } },
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

    // Pagination
    const cursor = optStr(url.searchParams.get("cursor"));
    const page = toInt(url.searchParams.get("page"), 1, 1, 100000);
    const limitStr = url.searchParams.get("limit");
    const pageSizeStr = url.searchParams.get("pageSize");
    const hasLimit =
      typeof limitStr === "string" && limitStr.trim() !== "" && Number.isFinite(Number(limitStr));
    const hasPageSize =
      typeof pageSizeStr === "string" && pageSizeStr.trim() !== "" && Number.isFinite(Number(pageSizeStr));

    let pageSize = DEFAULT_PAGE_SIZE;
    if (hasLimit) pageSize = toInt(limitStr!, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    else if (hasPageSize) pageSize = toInt(pageSizeStr!, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

    // -------------------- build non-search filters --------------------
    const statusParam = optStr(url.searchParams.get("status"));
    const whereBase: Record<string, any> = {};
    if (!statusParam || statusParam.toUpperCase() === "ACTIVE") whereBase["status"] = "ACTIVE";
    else if (statusParam.toUpperCase() !== "ALL") whereBase["status"] = statusParam.toUpperCase();

    const ANDExtra: any[] = [];
    if (category) ANDExtra.push({ category: { equals: category, mode: "insensitive" } });
    if (subcategory) ANDExtra.push({ subcategory: { equals: subcategory, mode: "insensitive" } });
    if (sellerId) ANDExtra.push({ sellerId });

    // verifiedOnly overrides featured
    if (verifiedOnly === true) {
      ANDExtra.push({ featured: true });
    } else if (typeof featured === "boolean") {
      ANDExtra.push({ featured });
    }

    // Price filter logic
    if (minPriceStr !== null || maxPriceStr !== null) {
      const minPrice = minPriceStr !== null ? toInt(minPriceStr, 0, 0, 9_999_999) : undefined;
      const maxPrice = maxPriceStr !== null ? toInt(maxPriceStr, 9_999_999, 0, 9_999_999) : undefined;

      const priceClause: { gte?: number; lte?: number } = {};
      if (typeof minPrice === "number") priceClause.gte = minPrice;
      if (typeof maxPrice === "number") priceClause.lte = maxPrice;

      if (!minPrice || minPrice === 0) {
        ANDExtra.push({ OR: [{ price: null }, { price: priceClause }] });
      } else {
        ANDExtra.push({ price: priceClause });
      }
    }

    // When sorting by price, exclude nulls for stable ordering
    if (sort === "price_asc" || sort === "price_desc") {
      ANDExtra.push({ price: { not: null } });
    }

    // -------------------- choose a working search WHERE --------------------
    const isSearchRequested = !!rawQ;
    let chosenWhere: Record<string, any> | null = null;
    let chosenFields: SearchField[] = [];

    if (isSearchRequested) {
      for (const fields of SEARCH_FIELD_VARIANTS) {
        const ANDsearch = buildSearchAND(tokens, rawQ, fields);
        const candidate: Record<string, any> = { ...whereBase };
        const AND: any[] = [];
        if (ANDsearch.length) AND.push(...ANDsearch);
        if (ANDExtra.length) AND.push(...ANDExtra);
        if (AND.length) candidate["AND"] = AND;

        try {
          await Service.count({ where: candidate });
          chosenWhere = candidate;
          chosenFields = fields;
          break;
        } catch (e) {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "[/api/services] search variant failed; trying next:",
              fields,
              (e as any)?.message ?? e
            );
          }
        }
      }
    }

    // Fallback: no search or no variant worked → only non-search filters
    if (!chosenWhere) {
      const candidate: Record<string, any> = { ...whereBase };
      if (ANDExtra.length) candidate["AND"] = ANDExtra;
      chosenWhere = candidate;
    }

    const isSearchLike = !!rawQ || !!category || !!subcategory;

    // Primary orderBy + fallbacks
    let primaryOrder: any;
    if (sort === "price_asc")
      primaryOrder = [{ price: "asc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];
    else if (sort === "price_desc")
      primaryOrder = [{ price: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];
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
      console.log("[/api/services WHERE]", safe(chosenWhere));
      console.log("[/api/services ORDER primary]", safe(primaryOrder));
      console.log("[/api/services page/pageSize]", page, pageSize, "cursor:", cursor ?? null);
      if (chosenFields.length) console.log("[/api/services SEARCH FIELDS]", chosenFields.join(", "));
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

    // Select candidates (schema tolerant). Always include gallery; never include title.
    const selectCandidates: any[] = [
      {
        id: true,
        name: true,
        category: true,
        subcategory: true,
        price: true,
        rateType: true,
        serviceArea: true,
        image: true,
        gallery: true,
        location: true,
        featured: true,
        createdAt: true,
        sellerId: true,
        seller: { select: { username: true } },
      },
      {
        id: true,
        name: true,
        category: true,
        subcategory: true,
        price: true,
        image: true,
        gallery: true,
        location: true,
        featured: true,
        createdAt: true,
        sellerId: true,
        seller: { select: { username: true } },
      },
      // fallbacks without seller relation
      {
        id: true,
        name: true,
        category: true,
        subcategory: true,
        price: true,
        rateType: true,
        serviceArea: true,
        image: true,
        gallery: true,
        featured: true,
        createdAt: true,
        sellerId: true,
      },
      {
        id: true,
        name: true,
        category: true,
        subcategory: true,
        price: true,
        image: true,
        gallery: true,
        featured: true,
        createdAt: true,
        sellerId: true,
      },
      { id: true, name: true, createdAt: true, featured: true },
      { id: true },
    ];

    // Build list args with pagination (cursor tolerant to numeric/string IDs)
    const baseListArgsCommon: any = {
      where: chosenWhere,
      take: pageSize + 1,
    };

    const cursorVariants: any[] = [];
    if (cursor) {
      // try string id
      cursorVariants.push({ ...baseListArgsCommon, cursor: { id: cursor }, skip: 1 });
      // try numeric id
      const asNum = Number(cursor);
      if (Number.isFinite(asNum)) {
        cursorVariants.push({ ...baseListArgsCommon, cursor: { id: asNum }, skip: 1 });
      }
    } else {
      cursorVariants.push({ ...baseListArgsCommon, skip: (page - 1) * pageSize });
    }

    // total first (cheap & robust)
    const total = await Service.count({ where: chosenWhere });

    // findMany with tolerant select + orderBy + cursor variants
    let rowsRaw: any[] = [];
    outer: for (const select of selectCandidates) {
      for (const orderBy of orderByCandidates) {
        for (const listArgs of cursorVariants) {
          try {
            rowsRaw = await Service.findMany({ ...listArgs, select, orderBy });
            break outer;
          } catch {
            /* try next combo */
          }
        }
      }
    }

    const hasMore = rowsRaw.length > pageSize;
    const data = hasMore ? rowsRaw.slice(0, pageSize) : rowsRaw;
    const nextCursor = hasMore && data.length ? data[data.length - 1]!.id : null;

    const items = (data as Array<any>).map((s) => {
      const gallery = Array.isArray(s.gallery) ? s.gallery.filter(Boolean) : [];
      return {
        id: String(s.id),
        name: String(s.name ?? "Service"),
        category: (s.category ?? null) as string | null,
        subcategory: (s.subcategory ?? null) as string | null,
        price: typeof s.price === "number" ? s.price : null,
        rateType: (s.rateType ?? null) as "hour" | "day" | "fixed" | null,
        serviceArea: (s.serviceArea ?? null) as string | null,
        image: (s.image ?? (gallery[0] ?? null)) as string | null, // fallback to first gallery image
        gallery, // expose gallery to UI
        featured: Boolean(s.featured),
        location: (s.location ?? null) as string | null,
        createdAt:
          s?.createdAt instanceof Date
            ? s.createdAt.toISOString()
            : typeof s?.createdAt === "string"
            ? s.createdAt
            : "",
        sellerId: s?.sellerId ? String(s.sellerId) : undefined,
        sellerUsername: s?.seller?.username ?? null,
      };
    });

    // facets (first page only, no cursor)
    let facets: any | undefined = undefined;
    if (wantFacets && !cursor && page === 1) {
      facets = await computeFacets(chosenWhere, Service);
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
    if (process.env.NODE_ENV !== "production") {
      res.headers.set("X-Query-Tokens", tokens.join(" "));
      if (chosenFields.length) res.headers.set("X-Search-Fields", chosenFields.join(","));
    }
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
      .slice(0, 6)
      .map((x) => ({ value: String(x.category), count: x._count._all }));

    const subcategories = (subsRaw as SubcatRow[])
      .filter((x) => !!x.subcategory)
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 6)
      .map((x) => ({ value: String(x.subcategory), count: x._count._all }));

    return { categories, subcategories };
  } catch {
    return undefined;
  }
}

/* ----------------------------- misc verbs ----------------------------- */
export async function HEAD(_req: Request) {
  const h = new Headers();
  h.set("X-Services-Version", SERVICES_VER);
  h.set("Vary", "Authorization, Cookie, Accept-Encoding");
  h.set("Cache-Control", "no-store, no-cache, must-revalidate");
  h.set("Pragma", "no-cache");
  h.set("Expires", "0");
  return new Response(null, { status: 204, headers: h });
}

export async function OPTIONS(req: Request) {
  const originHeader =
    req.headers.get("origin") ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    "*";

  const h = new Headers();
  h.set("X-Services-Version", SERVICES_VER);
  h.set("Vary", "Origin, Authorization, Cookie, Accept-Encoding");

  // CORS
  h.set("Access-Control-Allow-Origin", originHeader);
  h.set("Access-Control-Allow-Methods", "GET, POST, PATCH, HEAD, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Max-Age", "86400");

  // no-store for preflight
  h.set("Cache-Control", "no-store, no-cache, must-revalidate");
  h.set("Pragma", "no-cache");
  h.set("Expires", "0");

  return new Response(null, { status: 204, headers: h });
}
