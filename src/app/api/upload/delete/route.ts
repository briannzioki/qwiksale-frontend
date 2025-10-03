// src/app/api/upload/delete/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { deleteByUrlOrId } from "@/app/lib/media";

function ok(json: unknown, cache = "no-store") {
  const res = NextResponse.json(json);
  res.headers.set("Cache-Control", cache);
  return res;
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const qpId = url.searchParams.get("id") || url.searchParams.get("url") || "";
    const body = await req.json().catch(() => null);
    const raw = String(body?.id || body?.url || qpId || "").trim();

    if (!raw) return ok({ ok: false, error: "Missing id" });

    await deleteByUrlOrId(raw);
    return ok({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[upload/delete] error", e);
    return NextResponse.json({ ok: false, error: "Failed to delete" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  // Support DELETE with ?id=... or ?url=...
  return POST(req);
}

export async function HEAD() {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
