// src/app/api/products/[id]/contact/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

// tiny helper to always disable caching
function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = String(params.id || "").trim();
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    // Optional: who is viewing (guests allowed)
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

    if (!p) return noStore({ error: "Not found" }, { status: 404 });

    // Best-effort IP/UA (works on Vercel)
    const ipHeader =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-vercel-forwarded-for") ||
      "";
    const ip = ipHeader.split(",")[0]?.trim() || null;
    const ua = req.headers.get("user-agent") || null;

    // Log reveal (ignore failures)
    await prisma.contactReveal
      .create({
        data: {
          productId: id,
          viewerUserId: viewerUserId ?? null,
          ip,
          userAgent: ua,
        },
      })
      .catch(() => {});

    const contact = {
      name: p.sellerName || "Seller",
      phone: p.sellerPhone || null,
      location: p.sellerLocation || null,
    };

    return noStore({
      product: { id: p.id, name: p.name },
      contact,
      suggestLogin: !viewerUserId,
    });
  } catch (e) {
    console.warn("[products/:id/contact GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
