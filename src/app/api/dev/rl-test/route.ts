export const preferredRegion = 'fra1';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, NextRequest } from "next/server";
import { checkRateLimit } from "@/app/lib/ratelimit";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const name = url.searchParams.get("name") || "diag";
    const limit = Number(url.searchParams.get("limit") || 5);      // default 5
    const windowMs = Number(url.searchParams.get("win") || 10_000); // default 10s

    // IMPORTANT: only IP bucket; no user id
    const rl = await checkRateLimit(req.headers, {
      name,
      limit,
      windowMs,
    });

    // surface a bit of context
    return NextResponse.json({
      ok: rl.ok,
      retryAfterSec: rl.retryAfterSec,
      note: "If this never flips to ok:false after >limit hits in window, Upstash is not being used.",
    }, {
      status: rl.ok ? 200 : 429,
      headers: { "Retry-After": String(rl.retryAfterSec) },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[dev/rl-test] error", e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}


