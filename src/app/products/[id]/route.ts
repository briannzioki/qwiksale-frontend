// src/app/api/products/[id]/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, ctx: Ctx) {
  const id = ctx.params.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const p = await prisma.product.findUnique({
    where: { id },
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
      featured: true,
      // flattened snapshot fields:
      sellerName: true,
      sellerPhone: true,
      sellerLocation: true,
      sellerMemberSince: true,
      sellerRating: true,
      sellerSales: true,
    },
  });

  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(p, { headers: { "Cache-Control": "no-store" } });
}
