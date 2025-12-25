// src/app/api/home-feed/route.ts
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { jsonPublic } from "@/app/api/_lib/responses";
import type { SellerBadgeFields } from "@/app/lib/sellerVerification";
import {
  buildSellerBadgeFields,
  resolveSellerBadgeFieldsFromUserLike,
} from "@/app/lib/sellerVerification";

/**
 * Home feed API
 * - t=all returns BOTH products & services (merged, de-duped, sorted).
 * - Respects `limit` (preferred) and falls back to `pageSize`.
 * - NO hard status/price caps that hide seed data. (Status filter is opt-in.)
 * - Stable tie-breaks: featured desc → createdAt desc → id desc.
 */

const VER = "vHOME-FEED-005";
const SOFT_TIMEOUT_MS = 2200;
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 48;

type Mode = "all" | "products" | "services";
type SortKey = "newest" | "price_asc" | "price_desc" | "featured";
type StatusParam = "any" | "active" | "hidden" | "draft" | "sold";

type ProductRow = {
  id: string | number;
  name?: string | null;
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  condition?: string | null;
  price?: number | null;
  image?: string | null;
  gallery?: string[] | null;
  featured?: boolean | null;
  createdAt?: Date | string | null;
  location?: string | null;
  sellerId?: string | null;
};

type ServiceRow = {
  id: string | number;
  name?: string | null;
  category?: string | null;
  subcategory?: string | null;
  price?: number | null;
  image?: string | null;
  gallery?: string[] | null;
  featured?: boolean | null;
  createdAt?: Date | string | null;
  location?: string | null;
  sellerId?: string | null;
};

const productSelect = {
  id: true,
  name: true,
  category: true,
  subcategory: true,
  brand: true,
  condition: true,
  price: true,
  image: true,
  gallery: true,
  featured: true,
  createdAt: true,
  location: true,
  sellerId: true,
} as const;

const serviceSelect = {
  id: true,
  name: true,
  category: true,
  subcategory: true,
  price: true,
  image: true,
  gallery: true,
  featured: true,
  createdAt: true,
  location: true,
  sellerId: true,
} as const;

/* ------------------------------- Small utils ------------------------------ */

function attach(h: Headers) {
  h.set("X-Home-Feed-Version", VER);
  h.set("Vary", "Authorization, Cookie, Accept-Encoding");
}

function toInt(v: string | null | undefined, d: number, min: number, max: number) {
  if (v == null || v.trim() === "") return d;
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
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

function toSort(v: string | null): SortKey {
  const t = (v || "").trim().toLowerCase();
  if (t === "price_asc" || t === "price-asc") return "price_asc";
  if (t === "price_desc" || t === "price-desc") return "price_desc";
  if (t === "featured") return "featured";
  return "newest";
}

function toStatus(v: string | null): StatusParam {
  const t = (v || "").trim().toLowerCase();
  if (t === "active" || t === "hidden" || t === "draft" || t === "sold") return t;
  return "any";
}

function rejectingTimeout<T = never>(ms: number): Promise<T> {
  return new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms));
}

function toIso(x: unknown): string {
  if (!x) return "";
  if (x instanceof Date) return x.toISOString();
  const s = String(x);
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
}

/* ------------------------ seller badge helpers ------------------------ */

async function fetchSellerBadgeMap(ids: string[]) {
  const out = new Map<string, SellerBadgeFields>();
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (!uniq.length) return out;

  // Canonical empty badges (unknown stays null)
  const NULL_BADGES = buildSellerBadgeFields(null, null);

  try {
    const rows = await Promise.race([
      prisma.$queryRaw<{ id: string; u: any }[]>`
        SELECT u.id, row_to_json(u) as u
        FROM "User" u
        WHERE u.id IN (${Prisma.join(uniq)})
      `,
      rejectingTimeout(SOFT_TIMEOUT_MS),
    ]).catch(() => []);

    for (const r of rows as any[]) {
      const id = String(r?.id ?? "");
      if (!id) continue;

      const u = r?.u;
      const badges = u
        ? (resolveSellerBadgeFieldsFromUserLike(u) as SellerBadgeFields)
        : NULL_BADGES;

      out.set(id, badges);
    }
  } catch {
    // ignore: return empty map (caller will attach nulls)
  }

  return out;
}

/* --------------------------------- Query --------------------------------- */

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  // mode
  const tRaw = (url.searchParams.get("t") || url.searchParams.get("tab") || "all").toLowerCase();
  const mode: Mode = tRaw === "products" || tRaw === "services" ? (tRaw as Mode) : "all";

  // search & filters
  const q = (url.searchParams.get("q") || "").trim().slice(0, 64);
  const tokens = q
    ? q
        .split(/\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 1)
        .slice(0, 5)
    : [];

  const category = optStr(url.searchParams.get("category"));
  const subcategory = optStr(url.searchParams.get("subcategory"));
  const brand = optStr(url.searchParams.get("brand")); // products only
  const condition = optStr(url.searchParams.get("condition")); // products only
  const featured = toBool(url.searchParams.get("featured"));

  // Prices (optional) — if absent, DO NOT implicitly exclude nulls
  const minPriceStr = url.searchParams.get("minPrice");
  const maxPriceStr = url.searchParams.get("maxPrice");

  // Optional status ("any" by default so we don't hide seed)
  const statusParam = toStatus(url.searchParams.get("status"));

  // paging / sizing — prefer `limit` if present
  const page = toInt(url.searchParams.get("page"), 1, 1, 100_000);
  const fallbackPageSize = toInt(
    url.searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE,
    1,
    MAX_PAGE_SIZE,
  );
  const limit = toInt(url.searchParams.get("limit"), fallbackPageSize, 1, MAX_PAGE_SIZE);

  // sort
  const sort = toSort(url.searchParams.get("sort"));

  // helpers
  const makeSearchOR = (fields: string[], needle: string) =>
    ({
      OR: fields.map((f) => ({
        [f]: { contains: needle, mode: "insensitive" },
      })),
    } as any);

  const priceClause = () => {
    if (minPriceStr === null && maxPriceStr === null) return undefined;

    const min =
      minPriceStr !== null ? toInt(minPriceStr, 0, 0, 9_999_999) : undefined;
    const max =
      maxPriceStr !== null ? toInt(maxPriceStr, 9_999_999, 0, 9_999_999) : undefined;

    const clause: { gte?: number; lte?: number } = {};
    if (typeof min === "number") clause.gte = min;
    if (typeof max === "number") clause.lte = max;

    // If caller didn’t set a meaningful floor, we keep “price: null” items.
    const includeNulls = minPriceStr === null || min === 0;

    return { clause, includeNulls };
  };

  const statusWhere = (tableKey = "status") => {
    if (statusParam === "any") return undefined;
    const want = statusParam.toUpperCase();
    return { [tableKey]: { equals: want } } as any;
  };

  const makeProductWhere = () => {
    const AND: any[] = [];
    const sw = statusWhere("status");
    if (sw) AND.push(sw);

    if (tokens.length) {
      for (const t of tokens)
        AND.push(makeSearchOR(["name", "brand", "category", "subcategory"], t));
    } else if (q) {
      AND.push(makeSearchOR(["name", "brand", "category", "subcategory"], q));
    }

    if (category) AND.push({ category: { equals: category, mode: "insensitive" } });
    if (subcategory)
      AND.push({ subcategory: { equals: subcategory, mode: "insensitive" } });
    if (brand) AND.push({ brand: { contains: brand, mode: "insensitive" } });
    if (condition) AND.push({ condition: { equals: condition, mode: "insensitive" } });
    if (typeof featured === "boolean") AND.push({ featured });

    const p = priceClause();
    if (p) {
      AND.push(
        p.includeNulls ? { OR: [{ price: null }, { price: p.clause }] } : { price: p.clause },
      );
    }

    if (sort === "price_asc" || sort === "price_desc") AND.push({ price: { not: null } });

    return AND.length ? { AND } : {};
  };

  const makeServiceWhere = () => {
    const AND: any[] = [];
    const sw = statusWhere("status");
    if (sw) AND.push(sw);

    if (tokens.length) {
      for (const t of tokens)
        AND.push(makeSearchOR(["name", "description", "category", "subcategory"], t));
    } else if (q) {
      AND.push(makeSearchOR(["name", "description", "category", "subcategory"], q));
    }

    if (category) AND.push({ category: { equals: category, mode: "insensitive" } });
    if (subcategory)
      AND.push({ subcategory: { equals: subcategory, mode: "insensitive" } });
    if (typeof featured === "boolean") AND.push({ featured });

    const p = priceClause();
    if (p) {
      AND.push(
        p.includeNulls ? { OR: [{ price: null }, { price: p.clause }] } : { price: p.clause },
      );
    }

    if (sort === "price_asc" || sort === "price_desc") AND.push({ price: { not: null } });

    return AND.length ? { AND } : {};
  };

  const orderFor = (kind: "product" | "service"): any[] => {
    if (sort === "price_asc") return [{ price: "asc" }, { createdAt: "desc" }, { id: "desc" }];
    if (sort === "price_desc") return [{ price: "desc" }, { createdAt: "desc" }, { id: "desc" }];
    if (sort === "featured")
      return [{ featured: "desc" }, { createdAt: "desc" }, { id: "desc" }];

    const isSearchLike = !!q || !!category || !!subcategory || (kind === "product" && !!brand);
    return isSearchLike
      ? [{ featured: "desc" }, { createdAt: "desc" }, { id: "desc" }]
      : [{ createdAt: "desc" }, { id: "desc" }];
  };

  const doProducts = async (take: number, skip: number): Promise<any[]> => {
    const where = makeProductWhere();

    const rows = (await prisma.product.findMany({
      where,
      select: productSelect,
      orderBy: orderFor("product"),
      skip,
      take: take + 1, // probe for "more"
    })) as unknown as ProductRow[];

    const data = rows.length > take ? rows.slice(0, take) : rows;

    return data.map((p) => {
      const gallery = Array.isArray(p.gallery) ? p.gallery.filter(Boolean) : [];
      const image = (p.image as string | null) ?? (gallery[0] ?? null);
      const id = String(p.id);

      return {
        type: "product" as const,
        id,
        href: `/product/${encodeURIComponent(id)}`,
        name: p.name ?? "Product",
        category: p.category ?? null,
        subcategory: p.subcategory ?? null,
        brand: p.brand ?? null,
        condition: p.condition ?? null,
        price: typeof p.price === "number" ? p.price : null,
        image,
        featured: !!p.featured,
        location: p.location ?? null,
        createdAt: toIso(p.createdAt),
        sellerId: p.sellerId ? String(p.sellerId) : null,
      };
    });
  };

  const doServices = async (take: number, skip: number): Promise<any[]> => {
    const where = makeServiceWhere();

    const rows = (await prisma.service.findMany({
      where,
      select: serviceSelect,
      orderBy: orderFor("service"),
      skip,
      take: take + 1, // probe
    })) as unknown as ServiceRow[];

    const data = rows.length > take ? rows.slice(0, take) : rows;

    return data.map((s) => {
      const gallery = Array.isArray(s.gallery) ? s.gallery.filter(Boolean) : [];
      const image = (s.image as string | null) ?? (gallery[0] ?? null);
      const id = String(s.id);

      return {
        type: "service" as const,
        id,
        href: `/service/${encodeURIComponent(id)}`,
        name: s.name ?? "Service",
        category: s.category ?? null,
        subcategory: s.subcategory ?? null,
        price: typeof s.price === "number" ? s.price : null,
        image,
        featured: !!s.featured,
        location: s.location ?? null,
        createdAt: toIso(s.createdAt),
        sellerId: s.sellerId ? String(s.sellerId) : null,
      };
    });
  };

  try {
    let items: any[] = [];
    let productsArr: any[] = [];
    let servicesArr: any[] = [];

    const skip = (page - 1) * limit;

    if (mode === "products") {
      productsArr = await Promise.race([doProducts(limit, skip), rejectingTimeout(SOFT_TIMEOUT_MS)]).catch(
        () => [],
      );
      items = productsArr;
    } else if (mode === "services") {
      servicesArr = await Promise.race([doServices(limit, skip), rejectingTimeout(SOFT_TIMEOUT_MS)]).catch(
        () => [],
      );
      items = servicesArr;
    } else {
      // t=all → ensure BOTH kinds show up:
      const half = Math.max(1, Math.floor(limit / 2));
      const over = Math.min(2, Math.max(0, limit - half * 2));
      const takeProducts = half + over; // slight bias to products if odd
      const takeServices = half;

      const p = Promise.race([doProducts(takeProducts + 2, skip), rejectingTimeout(SOFT_TIMEOUT_MS)]).catch(
        () => [],
      );
      const s = Promise.race([doServices(takeServices + 2, skip), rejectingTimeout(SOFT_TIMEOUT_MS)]).catch(
        () => [],
      );

      const [a, b] = await Promise.all([p, s]);

      productsArr = a;
      servicesArr = b;

      // Merge & sort: featured desc → createdAt desc → id desc
      items = [...a, ...b].sort((x: any, y: any) => {
        const f = Number(!!y.featured) - Number(!!x.featured);
        if (f !== 0) return f;

        const dx = Date.parse(String(x.createdAt ?? "")) || 0;
        const dy = Date.parse(String(y.createdAt ?? "")) || 0;
        if (dy !== dx) return dy - dx;

        return String(y.id).localeCompare(String(x.id));
      });

      if (items.length > limit) items = items.slice(0, limit);
    }

    const allSellerIds = Array.from(
      new Set(
        [...items, ...productsArr, ...servicesArr]
          .map((x: any) => x?.sellerId)
          .filter(Boolean),
      ),
    ) as string[];

    const badgeMap = await fetchSellerBadgeMap(allSellerIds);
    const NULL_BADGES = buildSellerBadgeFields(null, null);

    const applyBadges = (arr: any[]) =>
      arr.map((x: any) => {
        const sid = String(x?.sellerId ?? "");
        const b = sid ? badgeMap.get(sid) : undefined;
        const badges = b ?? NULL_BADGES;

        return {
          ...x,
          sellerVerified: badges.sellerVerified,
          sellerFeaturedTier: badges.sellerFeaturedTier,
          sellerBadges: badges.sellerBadges,
        };
      });

    const itemsWithBadges = applyBadges(items);
    const productsWithBadges = applyBadges(productsArr.slice(0, Math.min(productsArr.length, limit)));
    const servicesWithBadges = applyBadges(servicesArr.slice(0, Math.min(servicesArr.length, limit)));

    const payload = {
      mode,
      page,
      pageSize: limit, // keep field name for backward compat
      total: itemsWithBadges.length,
      totalPages: 1 as const,
      items: itemsWithBadges,
      products: productsWithBadges,
      services: servicesWithBadges,
      debug: {
        sort,
        status: statusParam,
        q: q || undefined,
        hasTokens: tokens.length > 0 ? tokens.length : undefined,
        category,
        subcategory,
        brand,
        condition,
        featured,
      },
    };

    const res = jsonPublic(payload, 0);
    attach(res.headers);
    return res;
  } catch {
    const res = jsonPublic(
      {
        mode,
        page,
        pageSize: limit,
        total: 0,
        totalPages: 1,
        items: [],
        products: [],
        services: [],
        debug: { error: "timeout" },
      },
      0,
    );
    attach(res.headers);
    res.headers.set("X-Timeout", "1");
    return res;
  }
}
