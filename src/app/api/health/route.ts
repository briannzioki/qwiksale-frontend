export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { ok: true, ts: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        Vary: "Authorization, Cookie, Accept-Encoding, Origin",
      },
    }
  );
}
