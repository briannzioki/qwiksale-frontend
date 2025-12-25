// src/app/api/services/search/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { checkRateLimit } from "@/app/lib/ratelimit";
import { tooMany } from "@/app/lib/ratelimit-response";
import type { FeaturedTier } from "@/app/lib/sellerVerification";
import {
  buildSellerBadgeFields,
  resolveSellerBadgeFieldsFromUserLike,
} from "@/app/lib/sellerVerification";

/* ---------------------------- helpers ---------------------------- */
function resp(json: unknown, init?: ResponseInit) {
  return NextResponse.json(json, init);
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
  const auth = req.headers.get("authorization");
  const cookie = req.headers.get("cookie");
  if (auth || (cookie && cookie.includes("session"))) return false;
  if (page > 10 || pageSize > 48) return false;
  return true;
}

/* ------------------------ seller badge helpers ------------------------ */

type SellerBadgesObj = { verified: boolean | null; tier: FeaturedTier | null };

type SellerBadgePayload = {
  sellerVerified: boolean | null;
  sellerFeaturedTier: FeaturedTier | null;
  sellerBadges: SellerBadgesObj;
  [k: string]: unknown;
};

function toNullableBool(v: unknown): boolean | null {
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

function toNullableTier(v: unknown): FeaturedTier | null {
  const t = String(v ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t.includes("diamond")) return "diamond";
  if (t.includes("gold")) return "gold";
  if (t.includes("basic")) return "basic";
  return null;
}

function canonicalizeSellerBadges(raw: any): SellerBadgePayload {
  const sellerVerified = toNullableBool(raw?.sellerVerified ?? raw?.sellerBadges?.verified);
  const sellerFeaturedTier = toNullableTier(raw?.sellerFeaturedTier ?? raw?.sellerBadges?.tier);

  let base: any = {};
  try {
    base = (buildSellerBadgeFields(sellerVerified, sellerFeaturedTier) as any) ?? {};
  } catch {
    base = {};
  }

  base.sellerVerified = sellerVerified;
  base.sellerFeaturedTier = sellerFeaturedTier;

  const rawBadges = raw?.sellerBadges;
  if (rawBadges && typeof rawBadges === "object" && !Array.isArray(rawBadges)) {
    base.sellerBadges = {
      verified: toNullableBool((rawBadges as any).verified),
      tier: toNullableTier((rawBadges as any).tier),
    } satisfies SellerBadgesObj;
  } else {
    base.sellerBadges = { verified: sellerVerified, tier: sellerFeaturedTier } satisfies SellerBadgesObj;
  }

  return base as SellerBadgePayload;
}

function resolveBadgesFromUserLike(u: any): SellerBadgePayload {
  try {
    const resolved = resolveSellerBadgeFieldsFromUserLike(u);
    return canonicalizeSellerBadges(resolved);
  } catch {
    return canonicalizeSellerBadges(null);
  }
}

function sanitizeSellerForResponse(seller: any) {
  if (!seller || typeof seller !== "object") return null;
  return {
    id: (seller as any).id ?? null,
    name: (seller as any).name ?? null,
    image: (seller as any).image ?? null,
    subscription: (seller as any).subscription ?? null,
    username: (seller as any).username ?? null,
  };
}

/** Lenient handle in case your Prisma model is generated with a different name. */
function getServiceModel() {
  const anyPrisma = prisma as any;
  const svc =
    anyPrisma.service ??
    anyPrisma.services ??
    anyPrisma.Service ??
    anyPrisma.Services ??
    null;

  if (!svc) return null;
  if (typeof svc.findMany !== "function" || typeof svc.count !== "function") return null;
  return svc as any;
}

/* ----------------------------- safety caps ------------------------------ */
const MAX_PAGE_SIZE = 48;
const DEFAULT_PAGE_SIZE = 24;
const MAX_RESULT_WINDOW = 10_000; // guard deep offset scans

/** Keep search payload lean (omit big fields like description/gallery). */
const baseSelect = {
  id: true,
  name: true,
  category: true,
  subcategory: true,
  image: true,
  gallery: true, // ✅ keep gallery for deterministic media + alias fields
  price: true,
  rateType: true,
  serviceArea: true,
  availability: true,
  location: true,
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
      emailVerified: true, // used ONLY for badge resolution; stripped from response
    },
  },
} as const;

function shape(row: any) {
  return {
    ...row,
    createdAt:
      row?.createdAt instanceof Date ? row.createdAt.toISOString() : String(row?.createdAt ?? ""),
  };
}

/* ------------------------------ GET ------------------------------ */
export async function GET(req: NextRequest) {
  try {
    // Per-IP throttle
    const rl = await checkRateLimit(req.headers, {
      name: "services_search",
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.ok) {
      return tooMany("You’re searching too fast. Please slow down.", rl.retryAfterSec);
    }

    const Service = getServiceModel();
    if (!Service) {
      const res = resp({
        page: 1,
        pageSize: 0,
        total: 0,
        totalPages: 1,
        items: [] as any[],
        nextCursor: null,
        hasMore: false,
      });
      return setNoStore(res);
    }

    const url = new URL(req.url);
    const q = s(url.searchParams.get("q"));
    const category = s(url.searchParams.get("category"));
    const subcategory = s(url.searchParams.get("subcategory"));
    const rateType = s(url.searchParams.get("rateType")); // "fixed" | "hour" | "day"
    const location = s(url.searchParams.get("location")) || s(url.searchParams.get("serviceArea"));
    const minPrice = n(url.searchParams.get("minPrice"));
    const maxPrice = n(url.searchParams.get("maxPrice"));
    const includeNoPrice = b(url.searchParams.get("includeNoPrice")) === true; // default false
    const verifiedOnly = b(url.searchParams.get("verifiedOnly"));
    const sort = (s(url.searchParams.get("sort")) || "top") as "top" | "new" | "price_asc" | "price_desc";

    // pagination: cursor (preferred) OR page
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
          { category: { contains: q, mode: "insensitive" } },
          { subcategory: { contains: q, mode: "insensitive" } },
          { serviceArea: { contains: q, mode: "insensitive" } },
          { availability: { contains: q, mode: "insensitive" } },
          { location: { contains: q, mode: "insensitive" } },
          { sellerName: { contains: q, mode: "insensitive" } },
          { sellerLocation: { contains: q, mode: "insensitive" } },
        ],
      });
    }
    if (category) and.push({ category: { equals: category, mode: "insensitive" } });
    if (subcategory) and.push({ subcategory: { equals: subcategory, mode: "insensitive" } });
    if (rateType) and.push({ rateType: { equals: rateType, mode: "insensitive" } });
    if (location) {
      and.push({
        OR: [
          { location: { contains: location, mode: "insensitive" } },
          { serviceArea: { contains: location, mode: "insensitive" } },
        ],
      });
    }

    // ✅ verifiedOnly means seller has emailVerified (NOT a "featured" shortcut)
    if (verifiedOnly === true) {
      and.push({ seller: { is: { emailVerified: { not: null } } } });
    }

    // Price range (AND bounds); optionally include nulls
    if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
      const price: any = {};
      if (Number.isFinite(minPrice)) price.gte = Math.max(0, minPrice!);
      if (Number.isFinite(maxPrice)) price.lte = Math.max(0, maxPrice!);
      and.push(includeNoPrice ? { OR: [{ price: null }, { price }] } : { price });
    }

    if (and.length) where.AND = and;

    // ORDER BY (stable with id tiebreaker)
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

    // Count (for pagination UI)
    const total = await Service.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);

    // Result window guard if using offset
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

    // Query list (cursor wins)
    const listArgs: any = {
      where,
      orderBy,
      select: baseSelect,
      take: pageSize + 1, // +1 to detect hasMore
    };
    if (cursor) {
      listArgs.cursor = { id: cursor };
      listArgs.skip = 1;
    } else {
      listArgs.skip = (safePage - 1) * pageSize;
    }

    const rows = await Service.findMany(listArgs);
    const hasMore = rows.length > pageSize;
    const data = hasMore ? rows.slice(0, pageSize) : rows;
    const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null;

    const items = data.map((r: any) => {
      const base = shape(r);

      const gallery = Array.isArray(r?.gallery) ? r.gallery.filter(Boolean) : [];
      const image = (r?.image ?? gallery[0] ?? null) as string | null;

      const sellerObj = r?.seller as any;
      const seller = sanitizeSellerForResponse(sellerObj);
      const badges = resolveBadgesFromUserLike(sellerObj);

      return {
        ...base,
        image,
        gallery,
        imageUrls: gallery,
        images: gallery,
        photos: gallery,
        seller,
        // ✅ canonical badge keys (always present; nulls when unknown)
        ...badges,
      };
    });

    const out = {
      page: safePage,
      pageSize,
      total,
      totalPages,
      items,
      nextCursor,
      hasMore,
    };

    const res = resp(out);
    return isSafeToCache(req, safePage, pageSize) ? setEdgeCache(res, 45) : setNoStore(res);
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[services/search GET] error", e);
    return setNoStore(resp({ error: "Server error" }, { status: 500 }));
  }
}
