// src/app/api/requests/[id]/boost/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import * as requestLimits from "@/app/lib/request-limits";

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

function daysFor(subscription?: string | null) {
  const s = String(subscription ?? "").toUpperCase();
  if (s === "PLATINUM") return 7;
  if (s === "GOLD") return 3;
  return 0;
}

/**
 * POST /api/requests/[id]/boost
 * Auth + entitlement check → set boostUntil
 */
export async function POST(_req: Request, ctx: RouteCtx) {
  try {
    const session = await auth();
    const meId = (session as any)?.user?.id as string | undefined;
    if (!meId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const id = await readParamId(ctx);
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });

    const limitsAny = requestLimits as any;
    const requestModel = (prisma as any).request;

    const r = await requestModel?.findUnique?.({
      where: { id },
      select: { id: true, ownerId: true, boostUntil: true, expiresAt: true, status: true },
    });

    if (!r) return noStore({ error: "Not found" }, { status: 404 });
    if (String(r.ownerId || "") !== meId) return noStore({ error: "Forbidden" }, { status: 403 });

    const now = new Date();
    if (r?.expiresAt && new Date(r.expiresAt).getTime() <= now.getTime()) {
      return noStore({ error: "Request has expired" }, { status: 400 });
    }
    if (String(r?.status || "").toUpperCase() === "CLOSED") {
      return noStore({ error: "Request is closed" }, { status: 400 });
    }

    // Preferred: project-wide booster hook
    if (typeof limitsAny?.assertCanBoostRequest === "function") {
      await limitsAny.assertCanBoostRequest({ meId, requestId: id });
    } else if (typeof limitsAny?.enforceBoostRequest === "function") {
      await limitsAny.enforceBoostRequest({ meId, requestId: id });
    }

    // Boost duration: limits hook, else fallback by subscription tier.
    const me = await prisma.user.findUnique({
      where: { id: meId },
      select: { id: true, subscription: true, subscriptionUntil: true },
    });

    let boostUntil: Date;
    if (typeof limitsAny?.computeBoostUntil === "function") {
      boostUntil = await limitsAny.computeBoostUntil({ meId, requestId: id, now });
    } else {
      const d = daysFor((me as any)?.subscription ?? null);
      if (d <= 0) return noStore({ error: "Boost not available on your plan" }, { status: 403 });
      boostUntil = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    }

    const updated = await requestModel?.update?.({
      where: { id },
      data: { boostUntil },
      select: { id: true, boostUntil: true },
    });

    return noStore({
      ok: true,
      request: {
        id: String(updated?.id || id),
        boostUntil: updated?.boostUntil ? new Date(updated.boostUntil).toISOString() : boostUntil.toISOString(),
      },
    });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn("[/api/requests/[id]/boost POST] error:", e);
    const msg = typeof e?.message === "string" ? e.message : null;
    if (msg && /plan|boost|entitle|quota|limit/i.test(msg)) {
      return noStore({ error: msg }, { status: 403 });
    }
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
