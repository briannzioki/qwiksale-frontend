// src/app/api/me/profile/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { prisma } from "@/app/lib/prisma";

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session as any)?.user?.id as string | undefined;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    username?: string | null;
    whatsapp?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    country?: string | null;
  };

  const data = {
    username: body.username?.trim() || null,
    whatsapp: body.whatsapp?.trim() || null,
    address: body.address?.trim() || null,
    postalCode: body.postalCode?.trim() || null,
    city: body.city?.trim() || null,
    country: body.country?.trim() || null,
  };

  try {
    const user = await prisma.user.update({
      where: { id: uid },
      data,
      select: { id: true, username: true },
    });
    return NextResponse.json({ ok: true, user }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Username already in use" }, { status: 409 });
    }
    console.error("[profile PATCH]", e);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
