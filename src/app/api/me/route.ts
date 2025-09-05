// src/app/api/me/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";                     // keep your helper
import { prisma } from "@/app/lib/prisma";        // keep your prisma path

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

// Define what “profile complete” means for now.
// Tweak this as your profile fields evolve (e.g., require phone/image, etc.)
function isProfileComplete(user: {
  name: string | null;
  username: string | null;
  // add optional fields if you want them to count:
  // phone?: string | null;
  // image?: string | null;
}) {
  return Boolean(user?.name && user?.username);
}

export async function GET() {
  try {
    // 1) Auth
    const session = await auth();
    const userId = (session as any)?.user?.id as string | undefined;
    if (!userId) return noStore({ error: "Unauthorized" }, { status: 401 });

    // 2) Fetch minimal fields we need (plus anything else you want)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        // phone: true,        // uncomment if you store phone
        // image: true,        // uncomment if you want to enforce avatar
        // emailVerified: true // example extra field
        // subscription: true,
        // subscriptionUntil: true,
        // role: true,
        // createdAt: true,
        // updatedAt: true,
      },
    });

    if (!user) return noStore({ error: "Not found" }, { status: 404 });

    // 3) Compute profile completeness
    const profileComplete = isProfileComplete(user);

    // 4) Return the flat shape SellClient expects
    return noStore({
      id: user.id,
      email: user.email,
      profileComplete,
    });
  } catch (e) {
    console.warn("[/api/me GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
