// src/app/api/products/[id]/contact/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession, authOptions } from "@/app/lib/auth";

// tiny helper to ensure no caching from intermediaries
function noStore<T extends BodyInit | null>(body: T, init?: ResponseInit) {
  const res = new NextResponse(body, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const productId = String(id || "").trim();
    if (!productId) {
      return noStore(JSON.stringify({ error: "Missing id" }), { status: 400 });
    }

    // Only fetch non-sensitive seller fields here; phone is on the flattened product
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        sellerName: true,
        sellerPhone: true,
        sellerLocation: true,
        seller: { select: { name: true, image: true } },
      },
    });

    if (!product) {
      return noStore(JSON.stringify({ error: "Not found" }), { status: 404 });
    }

    const session = await getServerSession(authOptions);

    const contact = {
      name: product.sellerName ?? product.seller?.name ?? null,
      phone: product.sellerPhone ?? null,
      location: product.sellerLocation ?? null,
    };

    // We allow reveal without login, but nudge users for safety
    const suggestLogin = !session?.user?.email;

    return noStore(
      JSON.stringify({
        ok: true,
        product: { id: product.id, name: product.name },
        contact,
        suggestLogin,
      }),
      { status: 200 }
    );
  } catch (err: any) {
    console.warn("[contact] error:", err?.message || err);
    return noStore(JSON.stringify({ error: "Server error" }), { status: 500 });
  }
}

// Optional: quick probe for health checks
export async function HEAD() {
  return noStore(null, { status: 204 });
}
