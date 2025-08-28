// src/app/api/favorites/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession, authOptions } from "@/app/lib/auth";

// Resolve current user's id from session
async function requireUserId() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return null;
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  return user?.id ?? null;
}

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

/**
 * GET /api/favorites?format=ids|full
 * - default `format=ids` returns: { items: string[] } (productIds)  ✅ matches useFavourites()
 * - `format=full` returns: { items: FavoriteWithProduct[] }
 */
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const format = (url.searchParams.get("format") || "ids").toLowerCase();

    if (format === "full") {
      const favorites = await prisma.favorite.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              brand: true,
              category: true,
              subcategory: true,
              condition: true,
              price: true,
              image: true,
              createdAt: true,
              featured: true,
              location: true,
            },
          },
        },
      });
      return noStore(NextResponse.json({ items: favorites }));
    }

    // default: ids only
    const rows = await prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { productId: true },
    });
    const ids = rows.map((r) => r.productId);
    return noStore(NextResponse.json({ items: ids }));
  } catch (e: any) {
    console.error("GET /api/favorites error", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/favorites
 * Body: { productId: string }
 * - Idempotent: upserts the favorite.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { productId } = await req.json();
    const pid = String(productId || "").trim();
    if (!pid) return NextResponse.json({ error: "productId is required" }, { status: 400 });

    // Optional: ensure product exists (nice error instead of FK failure)
    const exists = await prisma.product.findUnique({ where: { id: pid }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "Invalid productId" }, { status: 400 });

    await prisma.favorite.upsert({
      where: { userId_productId: { userId, productId: pid } },
      update: {},
      create: { userId, productId: pid },
    });

    return noStore(NextResponse.json({ ok: true, added: true, productId: pid }));
  } catch (e: any) {
    console.error("POST /api/favorites error", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/favorites
 * Body: { productId: string }
 * - Idempotent: succeeds even if it wasn't favorited.
 */
export async function DELETE(req: Request) {
  try {
    const userId = await requireUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { productId } = await req.json();
    const pid = String(productId || "").trim();
    if (!pid) return NextResponse.json({ error: "productId is required" }, { status: 400 });

    await prisma.favorite
      .delete({ where: { userId_productId: { userId, productId: pid } } })
      .catch(() => null);

    return noStore(NextResponse.json({ ok: true, removed: true, productId: pid }));
  } catch (e: any) {
    console.error("DELETE /api/favorites error", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
