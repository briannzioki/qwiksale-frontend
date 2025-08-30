// src/app/api/products/[id]/contact/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

type Ctx = { params: { id: string } };

export async function GET(req: Request, ctx: Ctx) {
  const id = ctx.params.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const session = await getServerSession(authOptions);
  const viewerUserId = (session as any)?.user?.id as string | undefined;

  const p = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      sellerName: true,
      sellerPhone: true,
      sellerLocation: true,
    },
  });

  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Log a reveal (optional)
  try {
    await prisma.contactReveal.create({
      data: {
        productId: id,
        viewerUserId: viewerUserId ?? null,
        ip: (req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || null,
        userAgent: req.headers.get("user-agent"),
      },
    });
  } catch {
    // non-fatal
  }

  const contact = {
    name: p.sellerName || "Seller",
    phone: p.sellerPhone || null,
    location: p.sellerLocation || null,
  };

  // Suggest login banner if user is a guest
  const suggestLogin = !viewerUserId;

  return NextResponse.json(
    { product: { id: p.id, name: p.name }, contact, suggestLogin },
    { headers: { "Cache-Control": "no-store" } }
  );
}
