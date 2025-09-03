// src/app/api/account/delete/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

export async function DELETE() {
  try {
    const session = await auth();
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    // Gather product IDs owned by this user
    const myProducts = await prisma.product.findMany({
      where: { sellerId: userId },
      select: { id: true },
    });

    // ✅ Add explicit type to avoid "implicitly has 'any'" error
    const productIds: string[] = myProducts.map((p: { id: string }) => p.id);

    await prisma.$transaction([
      // Favorites the user has saved
      prisma.favorite.deleteMany({ where: { userId } }),
      // Favorites pointing to their products
      prisma.favorite.deleteMany({ where: { productId: { in: productIds } } }),
      // Their products (ContactReveal is ON DELETE CASCADE; payments/tickets set null)
      prisma.product.deleteMany({ where: { sellerId: userId } }),
      // Finally the user (Accounts/Sessions are ON DELETE CASCADE)
      prisma.user.delete({ where: { id: userId } }),
    ]);

    // Best-effort: session revocation handled client-side via signOut
    return noStore({ ok: true });
  } catch (e) {
    console.warn("[/api/account/delete] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
