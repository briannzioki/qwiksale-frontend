// src/app/api/me/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  const uid = (session as any)?.user?.id as string | undefined;

  // Not signed in
  if (!uid) {
    return NextResponse.json(
      { authenticated: false, user: null, needsProfile: false },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      image: true,
      whatsapp: true,
      address: true,
      postalCode: true,
      city: true,
      country: true,
      verified: true,
      subscription: true,
      createdAt: true,
    },
  });

  const needsProfile = !(user?.username && user.username.trim().length >= 3);

  return NextResponse.json(
    { authenticated: true, user, needsProfile },
    { headers: { "Cache-Control": "no-store" } }
  );
}
