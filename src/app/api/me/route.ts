export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

const USERNAME_RE = /^[a-zA-Z0-9._]{3,24}$/;

export async function GET() {
  const session = await auth();
  const uid = (session as any)?.user?.id as string | undefined;
  const emailFromSession = (session as any)?.user?.email as string | null | undefined;

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

  const safeUser =
    user ?? {
      id: uid,
      email: emailFromSession ?? null,
      username: null,
      phone: null,
      whatsapp: null,
      address: null,
      postalCode: null,
      city: null,
      country: null,
    };

  const profileComplete = Boolean(
    safeUser.username && USERNAME_RE.test(String(safeUser.username))
  );

  return NextResponse.json(
    { user: safeUser, profileComplete },
    { headers: { "Cache-Control": "no-store" } }
  );
}
