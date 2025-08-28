// src/app/api/me/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession, authOptions } from "@/app/lib/auth";

function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

/**
 * GET /api/me
 * Returns:
 *  { authenticated: false }
 *  or
 *  {
 *    authenticated: true,
 *    user: { id, email, name, image?, subscription }
 *  }
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return noStore(NextResponse.json({ authenticated: false }));
    }

    // Thanks to your next-auth module augmentation, these are typed:
    const { id, email, name, image, subscription } = session.user as {
      id: string;
      email: string | null;
      name: string | null;
      image?: string | null;
      subscription?: "FREE" | "GOLD" | "PLATINUM";
    };

    return noStore(
      NextResponse.json({
        authenticated: true,
        user: {
          id,
          email,
          name,
          image: image ?? null,
          subscription: subscription ?? "FREE",
        },
      })
    );
  } catch (e: any) {
    // Don’t leak errors to clients; just say unauthenticated on failure
    return noStore(NextResponse.json({ authenticated: false }));
  }
}

/**
 * Optional fast auth-check:
 * HEAD /api/me
 * - 204 if authenticated
 * - 401 if not
 */
export async function HEAD() {
  const session = await getServerSession(authOptions);
  const res = new NextResponse(null, { status: session?.user ? 204 : 401 });
  return noStore(res);
}
