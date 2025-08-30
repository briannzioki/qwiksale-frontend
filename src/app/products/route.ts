// src/app/api/products/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { prisma } from "@/app/lib/prisma";

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session as any)?.user?.id as string | undefined;
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as any;

  const name = (body.name || "").toString().trim();
  const category = (body.category || "").toString().trim();
  const subcategory = (body.subcategory || "").toString().trim();

  if (!name || !category || !subcategory) {
    return NextResponse.json(
      { error: "name, category and subcategory are required" },
      { status: 400 }
    );
  }

  const description =
    typeof body.description === "string" ? body.description.trim() : null;

  const price = body.price === "" || body.price == null ? null : numOrNull(body.price);

  const image =
    typeof body.image === "string" && body.image.trim() ? body.image.trim() : null;

  const gallery: string[] = Array.isArray(body.gallery)
    ? body.gallery.filter((u: unknown) => typeof u === "string" && u.trim()).slice(0, 10)
    : [];

  const data = {
    name,
    description,
    category,
    subcategory,
    brand:
      typeof body.brand === "string" && body.brand.trim() ? body.brand.trim() : null,
    condition:
      typeof body.condition === "string" && body.condition.trim()
        ? body.condition.trim()
        : null,
    price,
    image,
    gallery,
    location:
      typeof body.location === "string" && body.location.trim()
        ? body.location.trim()
        : null,
    negotiable: !!body.negotiable,
    // link to seller (must be signed in)
    sellerId: uid,
    // snapshot fields (optional, help with listing cards)
    sellerName:
      typeof body.sellerName === "string" && body.sellerName.trim()
        ? body.sellerName.trim()
        : (session?.user?.name as string | null) ||
          (session?.user?.email?.split("@")[0] as string | null) ||
          "Private Seller",
    sellerPhone:
      typeof body.sellerPhone === "string" && body.sellerPhone.trim()
        ? body.sellerPhone.trim()
        : null,
    sellerLocation:
      typeof body.sellerLocation === "string" && body.sellerLocation.trim()
        ? body.sellerLocation.trim()
        : null,
    sellerMemberSince:
      typeof body.sellerMemberSince === "string" && body.sellerMemberSince.trim()
        ? body.sellerMemberSince.trim()
        : new Date().getFullYear().toString(),
    sellerRating:
      typeof body.sellerRating === "number" ? body.sellerRating : null,
    sellerSales: typeof body.sellerSales === "number" ? body.sellerSales : null,
  } as const;

  const created = await prisma.product.create({ data });
  return NextResponse.json({ id: created.id }, { status: 201 });
}
