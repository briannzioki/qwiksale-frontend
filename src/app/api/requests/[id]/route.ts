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
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    const t = d.getTime();
    if (!Number.isFinite(t)) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

function isPrismaValidationError(err: unknown) {
  const e = err as any;
  const name = typeof e?.name === "string" ? e.name : "";
  const msg = typeof e?.message === "string" ? e.message : "";
  return (
    name === "PrismaClientValidationError" ||
    msg.includes("PrismaClientValidationError") ||
    msg.includes("Invalid value for argument") ||
    msg.includes("Unknown argument")
  );
}

// IMPORTANT: Next.js' generated RouteContext expects params to be Promise-based here.
type RouteParams = { id: string };
type RouteCtx = { params: Promise<RouteParams> };

/**
 * GET /api/requests/:id
 * Full details (auth required); never returns contact numbers directly.
 */
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  try {
    const session = await auth();
    const meId = (session as any)?.user?.id as string | undefined;
    if (!meId) return noStore({ error: "Unauthorized" }, { status: 401 });

    // At runtime Next may provide a plain object; awaiting still works.
    const p = await (ctx?.params as any);
    const id = String((p as any)?.id || "").trim();
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const requestModel = (prisma as any).request;

    // Try the full select first (your existing contract).
    // If schema drift happens, fallback to a minimal safe select so we still return title for e2e.
    let r: any = null;

    try {
      r = await requestModel?.findUnique?.({
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
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[/api/requests/[id] GET] findUnique error (will fallback):", e);

      if (!isPrismaValidationError(e)) throw e;

      r = await requestModel?.findUnique?.({
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
          ownerId: true,
        },
      });
    }

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
          : r?.owner === null
            ? null
            : undefined,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/requests/[id] GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
