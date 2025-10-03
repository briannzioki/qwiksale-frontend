// src/app/api/products/[id]/media/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

type PatchBody = {
  items?: Array<{ id?: string; url: string; isCover?: boolean; sort?: number }>;
};

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: raw } = await context.params;
    const id = raw?.trim();
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const session = await auth().catch(() => null);
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        sellerId: true,
        image: true,   // cover URL
        gallery: true, // string[]
      },
    });
    if (!product) return noStore({ error: "Not found" }, { status: 404 });
    if (product.sellerId && product.sellerId !== userId) {
      return noStore({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as PatchBody | null;
    if (!body || !Array.isArray(body.items)) {
      return noStore({ error: "Bad request: expected {items: [...]}" }, { status: 400 });
    }

    const ordered = body.items
      .filter((x) => typeof x?.url === "string" && x.url.trim().length > 0)
      .sort((a, b) => {
        const sa = Number.isFinite(a.sort) ? (a.sort as number) : 0;
        const sb = Number.isFinite(b.sort) ? (b.sort as number) : 0;
        return sa - sb;
      });

    const seen = new Set<string>();
    const urls = ordered
      .map((x) => x.url.trim())
      .filter((u) => (seen.has(u) ? false : (seen.add(u), true)));

    const coverUrl = urls[0] ?? null;

    await prisma.product.update({
      where: { id },
      data: { image: coverUrl, gallery: urls },
    });

    return noStore({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[products media PATCH] error", e);
    return noStore({ error: "Failed" }, { status: 500 });
  }
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
