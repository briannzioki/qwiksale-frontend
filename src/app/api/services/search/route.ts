export const preferredRegion = ['fra1'];
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
  return NextResponse.json(json, init);
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
  return Number.isFinite(num) ? num : undefined;
}
function isSafeToCache(req: NextRequest, page: number, pageSize: number) {
  const auth = req.headers.get("authorization");
  const cookie = req.headers.get("cookie");
  if (auth || (cookie && cookie.includes("session"))) return false;
  if (page > 10 || pageSize > 48) return false;
  return true;
}

/** Use a lenient handle to the Service model to avoid TS errors if not generated yet. */
const db: any = prisma as any;

const baseSelect = {
  id: true,
  name: true,
  description: true,
  category: true,
  subcategory: true,
  image: true,
  gallery: true,
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
    // Per-IP rate limit (extraKey omitted; IP is already part of the key)
    const rl = await checkRateLimit(req.headers, {
      name: "services_search",
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
    const minPrice = n(url.searchParams.get("minPrice"));
    const maxPrice = n(url.searchParams.get("maxPrice"));
    const sort = (s(url.searchParams.get("sort")) || "top") as
      | "top"
      | "new"
      | "price_asc"
      | "price_desc";
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(
      96,
      Math.max(1, Number(url.searchParams.get("pageSize") || 24))
    );

    const where: any = { status: "ACTIVE" };

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { subcategory: { contains: q, mode: "insensitive" } },
        { serviceArea: { contains: q, mode: "insensitive" } },
        { availability: { contains: q, mode: "insensitive" } },
        { sellerName: { contains: q, mode: "insensitive" } },
        { sellerLocation: { contains: q, mode: "insensitive" } },
      ];
    }
    if (category) where.category = category;
    if (subcategory) where.subcategory = subcategory;

    if (typeof minPrice === "number") {
      where.OR ??= [];
      where.OR.push({ price: null }, { price: { gte: Math.max(0, minPrice) } });
    }
    if (typeof maxPrice === "number") {
      where.OR ??= [];
      where.OR.push({ price: null }, { price: { lte: Math.max(0, maxPrice) } });
    }

    let orderBy: any = {};
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
        orderBy = [{ featured: "desc" }, { createdAt: "desc" }, { id: "asc" }];
        break;
    }

    const total = await db.service.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const items = await db.service.findMany({
      where,
      orderBy,
      skip: (safePage - 1) * pageSize,
      take: pageSize,
      select: baseSelect,
    });

    const json = {
      page: safePage,
      pageSize,
      total,
      totalPages,
      items: items.map(shape),
    };

    const res = resp(json);
    return isSafeToCache(req, safePage, pageSize) ? setEdgeCache(res, 45) : setNoStore(res);
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[services/search GET] error", e);
    return setNoStore(resp({ error: "Server error" }, { status: 500 }));
  }
}
