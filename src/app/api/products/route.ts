// src/app/api/products/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

/* utils */
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
function toInt(v: string | null, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/** Select for list items (no Prisma types needed) */
const productListSelect = {
  id: true,
  name: true,
  description: true,
  category: true,
  subcategory: true,
  brand: true,
  condition: true,
  price: true,
  image: true,
  gallery: true,
  location: true,
  negotiable: true,
  createdAt: true,
  featured: true,
  sellerId: true,

  // flattened snapshot fields
  sellerName: true,
  sellerLocation: true,
  sellerMemberSince: true,
  sellerRating: true,
  sellerSales: true,

  // light linked seller info
  seller: { select: { id: true, name: true, image: true, subscription: true } },
} as const;

/* -------- GET /api/products — list (paginated) -------- */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const page = toInt(url.searchParams.get("page"), 1, 1, 100000);
    const pageSize = toInt(url.searchParams.get("pageSize"), 60, 1, 200);

    // Keep typing simple/robust across Prisma versions
    let where: any = undefined;
    if (q.length > 0) {
      where = {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { brand: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
          { subcategory: { contains: q, mode: "insensitive" } },
        ],
      };
    }

    const total = await prisma.product.count({ where });

    const items = await prisma.product.findMany({
      where,
      select: productListSelect,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // Avoid implicit-any by typing the callback param
    const mapped = items.map((p: any) => ({
      ...p,
      createdAt:
        p?.createdAt instanceof Date ? p.createdAt.toISOString() : String(p?.createdAt ?? ""),
    }));

    return noStore({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: mapped,
    });
  } catch (e) {
    console.warn("[/api/products GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* -------- POST /api/products — create (delegate to existing creator) -------- */
export async function POST(req: NextRequest) {
  const { POST: createProduct } = await import("./create/route");
  return createProduct(req);
}
