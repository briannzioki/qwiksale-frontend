// src/app/api/favorites/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth"; // ✅ v5 helper

function noStore<T>(res: NextResponse<T>) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

async function requireUserId() {
  const session = await auth();
  const id = (session?.user as any)?.id as string | undefined;
  if (id) return id;

  const email = session?.user?.email || null;
  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  return user?.id ?? null;
}

/**
 * GET /api/favorites?format=ids|full
 */
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return noStore(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }

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

    // 👇 add explicit param type to avoid implicit any
    const ids = rows.map((r: { productId: string }) => r.productId);

    return noStore(NextResponse.json({ items: ids }));
  } catch (e: any) {
    console.error("GET /api/favorites error:", e);
    return noStore(NextResponse.json({ error: e?.message || "Server error" }, { status: 500 }));
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return noStore(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }

    const body = (await req.json().catch(() => ({}))) as { productId?: unknown };
    const pid = String(body.productId ?? "").trim();
    if (!pid) {
      return noStore(NextResponse.json({ error: "productId is required" }, { status: 400 }));
    }

    const exists = await prisma.product.findUnique({ where: { id: pid }, select: { id: true } });
    if (!exists) {
      return noStore(NextResponse.json({ error: "Invalid productId" }, { status: 400 }));
    }

    await prisma.favorite.upsert({
      where: { userId_productId: { userId, productId: pid } },
      update: {},
      create: { userId, productId: pid },
    });

    return noStore(NextResponse.json({ ok: true, added: true, productId: pid }));
  } catch (e: any) {
    console.error("POST /api/favorites error:", e);
    return noStore(NextResponse.json({ error: e?.message || "Server error" }, { status: 500 }));
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await requireUserId();
    if (!userId) {
      return noStore(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }

    const body = (await req.json().catch(() => ({}))) as { productId?: unknown };
    const pid = String(body.productId ?? "").trim();
    if (!pid) {
      return noStore(NextResponse.json({ error: "productId is required" }, { status: 400 }));
    }

    await prisma.favorite
      .delete({ where: { userId_productId: { userId, productId: pid } } })
      .catch(() => null);

    return noStore(NextResponse.json({ ok: true, removed: true, productId: pid }));
  } catch (e: any) {
    console.error("DELETE /api/favorites error:", e);
    return noStore(NextResponse.json({ error: e?.message || "Server error" }, { status: 500 }));
  }
}

export async function HEAD() {
  return noStore(new NextResponse(null, { status: 204 }));
}
export async function OPTIONS() {
  return noStore(NextResponse.json({ ok: true }, { status: 200 }));
}
