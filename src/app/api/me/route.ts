export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

export async function GET() {
  const session = await getServerSession();
  const id = (session as any)?.user?.id as string | undefined;
  const email = session?.user?.email || undefined;

  if (!id && !email) {
    return noStore({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findFirst({
    where: id ? { id } : { email: email! },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      username: true,
      whatsapp: true,
      address: true,
      postalCode: true,
      city: true,
      country: true,
    },
  });

  if (!user) return noStore({ error: "Unauthorized" }, { status: 401 });

  return noStore({ user });
}
