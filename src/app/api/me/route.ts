// src/app/api/me/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

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

export async function GET() {
  try {
    const session = await auth().catch(() => null);
    const sessionUser = (session as any)?.user || null;

    // Prefer id; fall back to email → id
    let userId: string | undefined = sessionUser?.id as string | undefined;
    if (!userId && sessionUser?.email) {
      try {
        const u = await prisma.user.findUnique({
          where: { email: sessionUser.email as string },
          select: { id: true },
        });
        userId = u?.id;
      } catch {
        /* ignore */
      }
    }

    if (!userId) {
      return noStore({ error: "Unauthorized" }, { status: 401 });
    }

    // Grab everything (tolerant to schema drift)
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return noStore({ error: "Not found" }, { status: 404 });

    const username   = (user as any).username ?? null;
    const image      = (user as any).image ?? null;
    const phone      = (user as any).phone ?? null;
    const whatsapp   = (user as any).whatsapp ?? phone ?? null;
    const address    = (user as any).address ?? null;
    const postalCode = (user as any).postalCode ?? null;
    const city       = (user as any).city ?? null;
    const country    = (user as any).country ?? null;

    const profileComplete = Boolean(user.email) && Boolean(whatsapp);
    const isAdmin = Boolean((session as any)?.user?.isAdmin);

    return noStore({
      user: {
        id: user.id,
        email: user.email ?? null,
        username,
        image,
        phone,
        whatsapp,
        address,
        postalCode,
        city,
        country,
        profileComplete,
        isAdmin,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/me GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
