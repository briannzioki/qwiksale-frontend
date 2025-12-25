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
function noStoreJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function GET() {
  const session = await auth().catch(() => null);
  return noStoreJson(session, 200);
}

// Some clients / adapters may POST here in certain flows; keep it harmless + consistent.
export async function POST() {
  const session = await auth().catch(() => null);
  return noStoreJson(session, 200);
}
