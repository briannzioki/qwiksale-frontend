// src/app/api/me/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { prisma } from "@/app/lib/prisma";

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
      phone: true,
      whatsapp: true,
      address: true,
      postalCode: true,
      city: true,
      country: true,
    },
  });

  return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
}
