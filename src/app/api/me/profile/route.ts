// src/app/api/me/profile/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { prisma } from "@/app/lib/prisma";
import { normalizeKenyanPhone } from "@/app/lib/phone";

export async function GET() {
  const session = await getServerSession(authOptions);
  const uid = (session as any)?.user?.id as string | undefined;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: {
      id: true,
      email: true,
      username: true,
      whatsapp: true,
      address: true,
      postalCode: true,
      city: true,
      country: true,
      name: true,
    },
  });

  return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = (session as any)?.user?.id as string | undefined;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    username?: string | null;
    whatsapp?: string | null;   // raw user input (optional)
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    country?: string | null;
  };

  const username =
    typeof body.username === "string" && body.username.trim() ? body.username.trim() : null;

  // Normalize KE WhatsApp if provided
  let whatsapp: string | null = null;
  if (typeof body.whatsapp === "string") {
    const raw = body.whatsapp.trim();
    whatsapp = raw ? normalizeKenyanPhone(raw) : null; // null clears
  }

  const data: any = {
    username,
    address: body.address?.trim() || null,
    postalCode: body.postalCode?.trim() || null,
    city: body.city?.trim() || null,
    country: body.country?.trim() || null,
  };
  if (body.whatsapp !== undefined) data.whatsapp = whatsapp;

  try {
    const user = await prisma.user.update({
      where: { id: uid },
      data,
      select: { id: true, username: true, whatsapp: true },
    });
    return NextResponse.json({ ok: true, user }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Username already in use" }, { status: 409 });
    }
    console.error("[profile PATCH] unexpected:", e);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
