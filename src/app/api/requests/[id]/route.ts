// src/app/api/requests/[id]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function toIso(v: any) {
  try {
    return v ? new Date(v).toISOString() : null;
  } catch {
    return null;
  }
}

type RouteParams = { id: string };
type RouteCtx = { params: Promise<RouteParams> };

/**
 * GET /api/requests/[id]
 * Full details (auth required); never returns contact numbers directly.
 */
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  try {
    const session = await auth();
    const meId = (session as any)?.user?.id as string | undefined;
    if (!meId) return noStore({ error: "Unauthorized" }, { status: 401 });

    // Next.js 15 RouteContext params are Promise-based in generated types.
    const p = await ctx.params;
    const id = String(p?.id || "").trim();
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const requestModel = (prisma as any).request;

    const r = await requestModel?.findUnique?.({
      where: { id },
      select: {
        id: true,
        kind: true,
        title: true,
        description: true,
        location: true,
        category: true,
        tags: true,
        createdAt: true,
        expiresAt: true,
        status: true,
        boostUntil: true,
        contactEnabled: true,
        contactMode: true,
        ownerId: true,
        owner: {
          select: {
            id: true,
            name: true,
            username: true,
            image: true,
            verified: true,
            location: true,
            city: true,
            country: true,
            createdAt: true,
          },
        },
      },
    });

    if (!r) return noStore({ error: "Not found" }, { status: 404 });

    return noStore({
      ok: true,
      request: {
        ...r,
        createdAt: toIso(r?.createdAt),
        expiresAt: toIso(r?.expiresAt),
        boostUntil: toIso(r?.boostUntil),
        owner: r?.owner
          ? {
              ...r.owner,
              createdAt: toIso((r.owner as any)?.createdAt),
            }
          : null,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/requests/[id] GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
