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

export async function GET() {
  try {
    const session = await auth();
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        image: true,
        subscription: true,
        subscriptionUntil: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) return noStore({ error: "Not found" }, { status: 404 });
    return noStore({ user });
  } catch (e) {
    console.warn("[/api/me GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
