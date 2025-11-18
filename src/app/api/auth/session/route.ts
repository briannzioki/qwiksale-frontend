// src/app/api/auth/session/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Thin pass-through session endpoint with explicit no-store caching.
 * Note: NextAuth also exposes /api/auth/session; this exists to guarantee headers.
 */
export async function GET() {
  const session = await auth().catch(() => null);
  return NextResponse.json(session, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
