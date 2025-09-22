// src/app/api/health/route.ts (example)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { ok: true, ts: new Date().toISOString() },
    {
      headers: {
        // Be explicit: no CDN or browser caching
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        // Optional: handy during testing
        // "x-vercel-region": process.env.VERCEL_REGION ?? "unknown",
      },
    }
  );
}




