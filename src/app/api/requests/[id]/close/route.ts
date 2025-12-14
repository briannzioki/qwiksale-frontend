// src/app/api/requests/[id]/close/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

type RouteCtx = { params: Promise<{ id: string }> };

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

async function readParamId(ctx: RouteCtx): Promise<string> {
  const p: any = (ctx as any)?.params;
  const params = p && typeof p?.then === "function" ? await p : p;
  return String(params?.id ?? "").trim();
}

/**
 * POST /api/requests/[id]/close
 * Owner closes request (auth + owner check)
 */
export async function POST(_req: Request, ctx: RouteCtx) {
  try {
    const session = await auth();
    const meId = (session as any)?.user?.id as string | undefined;
    if (!meId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const id = await readParamId(ctx);
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const requestModel = (prisma as any).request;

    const r = await requestModel?.findUnique?.({
      where: { id },
      select: { id: true, ownerId: true, status: true },
    });

    if (!r) return noStore({ error: "Not found" }, { status: 404 });
    if (String(r.ownerId || "") !== meId) {
      return noStore({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await requestModel?.update?.({
      where: { id },
      data: { status: "CLOSED" },
      select: { id: true, status: true },
    });

    return noStore({ ok: true, request: updated });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/requests/[id]/close POST] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
