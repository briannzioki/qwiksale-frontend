// src/app/api/products/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

// Small helper to ensure responses are never cached
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

type RouteCtx = { params: Promise<{ id: string }> };

/* ----------------------------- GET /api/products/:id ----------------------------- */
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const productId = String(id || "").trim();
    if (!productId) return noStore({ error: "Missing id" }, { status: 400 });

    // Select only what the detail page needs (no raw seller phone here; phone is revealed via /api/products/[id]/contact)
    const item = await prisma.product.findUnique({
      where: { id: productId },
      select: {
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

        // Flattened/legacy seller fields that are safe to show:
        sellerName: true,
        sellerLocation: true,
        sellerMemberSince: true,
        sellerRating: true,
        sellerSales: true,

        // Linked seller (no email/phone)
        seller: {
          select: {
            id: true,
            name: true,
            image: true,
            subscription: true,
          },
        },
      },
    });

    if (!item) return noStore({ error: "Not found" }, { status: 404 });
    return noStore(item);
  } catch (e) {
    console.warn("[products/:id GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* ---------------------------- PATCH /api/products/:id ---------------------------- */
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const productId = String(id || "").trim();
    if (!productId) return noStore({ error: "Missing id" }, { status: 400 });

    const session = await auth();
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const existing = await prisma.product.findUnique({ where: { id: productId } });
    if (!existing) return noStore({ error: "Not found" }, { status: 404 });

    // Enforce owner edits
    if (existing.sellerId && existing.sellerId !== userId) {
      return noStore({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({} as any));

    // Sanitize/normalize fields
    const normCondition = (() => {
      const t = (body?.condition ?? "").toString().trim().toLowerCase();
      if (!t) return undefined;
      if (["brand new", "brand-new", "brand_new"].includes(t)) return "brand new";
      if (["pre-owned", "pre owned", "pre_owned", "used"].includes(t)) return "pre-owned";
      return undefined;
    })();

    const normPrice =
      typeof body?.price === "number"
        ? Math.max(0, Math.round(body.price))
        : body?.price === null
        ? null
        : undefined;

    const normGallery = Array.isArray(body?.gallery)
      ? body.gallery.map((x: unknown) => String(x || "")).filter(Boolean)
      : undefined;

    const data = {
      name: typeof body?.name === "string" ? body.name.trim() : undefined,
      description: typeof body?.description === "string" ? body.description : undefined,
      category: typeof body?.category === "string" ? body.category : undefined,
      subcategory: typeof body?.subcategory === "string" ? body.subcategory : undefined,
      brand: typeof body?.brand === "string" ? body.brand : undefined,
      condition: normCondition,
      price: normPrice,
      image: typeof body?.image === "string" ? body.image : undefined,
      gallery: normGallery,
      location: typeof body?.location === "string" ? body.location : undefined,
      negotiable:
        typeof body?.negotiable === "boolean" ? body.negotiable : undefined,
    };

    const updated = await prisma.product.update({
      where: { id: productId },
      data,
      select: {
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
    },
    });

    return noStore(updated);
  } catch (e) {
    console.warn("[products/:id PATCH] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}

/* --------------------------- DELETE /api/products/:id --------------------------- */
export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const productId = String(id || "").trim();
    if (!productId) return noStore({ error: "Missing id" }, { status: 400 });

    const session = await auth();
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const existing = await prisma.product.findUnique({ where: { id: productId } });
    if (!existing) return noStore({ error: "Not found" }, { status: 404 });

    if (existing.sellerId && existing.sellerId !== userId) {
      return noStore({ error: "Forbidden" }, { status: 403 });
    }

    // Delete related rows first, then the product (transactional)
    await prisma.$transaction([
      prisma.favorite.deleteMany({ where: { productId } }),
      // If you have a Payment table, add its cleanup here.
      prisma.product.delete({ where: { id: productId } }),
    ]);

    return noStore({ ok: true });
  } catch (e) {
    console.warn("[products/:id DELETE] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
