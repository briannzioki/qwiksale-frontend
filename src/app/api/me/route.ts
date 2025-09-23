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
 * - If your schema doesn't have `phone`, this won't crash — it will return `phone: null`.
 * - Cache is explicitly disabled (clients expect fresh data).
 */
export async function GET() {
  try {
    const session = await auth().catch(() => null);
    const userId = (session as any)?.user?.id as string | undefined;

    if (!userId) {
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch full user to avoid Prisma runtime errors if optional fields don't exist.
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return noStore({ error: "Not found" }, { status: 404 });
    }

    // `phone` might not exist in your schema — read it safely via `as any`.
    const safe = {
      id: user.id,
      email: user.email ?? null,
      username: (user as any).username ?? null,
      image: (user as any).image ?? null,
      phone: (user as any).phone ?? null,
      whatsapp: (user as any).whatsapp ?? null,
      address: (user as any).address ?? null,
      postalCode: (user as any).postalCode ?? null,
      city: (user as any).city ?? null,
      country: (user as any).country ?? null,
    };

    return noStore({ user: safe }, { status: 200 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/me GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
