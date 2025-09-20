export const preferredRegion = ['fra1'];
// src/app/api/me/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

/**
 * Return the signed-in user's minimal profile used by clients:
 * { id, email, username, image, phone, whatsapp, address, postalCode, city, country }
 *
 * NOTE:
 * - If you're not storing `phone`, remove it below (and from the client).
 * - Cache is explicitly disabled (clients expect fresh data).
 */
export async function GET() {
  try {
    const session = await auth().catch(() => null);
    const userId = (session as any)?.user?.id as string | undefined;

    if (!userId) {
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        image: true,           // <-- add profile photo
        // If your schema doesn't have `phone`, remove the next line.
        phone: true as any,    // keep as any if the field might not exist in Prisma types
        whatsapp: true,
        address: true,
        postalCode: true,
        city: true,
        country: true,
      },
    });

    if (!user) {
      return noStore({ error: "Not found" }, { status: 404 });
    }

    // Return nulls (not undefined) for stability in clients
    const safe = {
      id: user.id,
      email: user.email ?? null,
      username: user.username ?? null,
      image: user.image ?? null,
      phone: (user as any).phone ?? null,
      whatsapp: user.whatsapp ?? null,
      address: user.address ?? null,
      postalCode: user.postalCode ?? null,
      city: user.city ?? null,
      country: user.country ?? null,
    };

    return noStore({ user: safe }, { status: 200 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/me GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
