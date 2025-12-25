// src/app/api/requests/mine/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import * as requestLimits from "@/app/lib/request-limits";

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function capFor(subscription?: string | null) {
  const s = String(subscription ?? "").toUpperCase();
  if (s === "PLATINUM") return 25;
  if (s === "GOLD") return 10;
  return 3;
}

function toIso(v: any) {
  try {
    return v ? new Date(v).toISOString() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const session = await auth();
    const meId = (session as any)?.user?.id as string | undefined;
    if (!meId) return noStore({ error: "Unauthorized" }, { status: 401 });

    const limitsAny = requestLimits as any;

    const requestModel = (prisma as any).request;

    const [me, mineRaw] = await Promise.all([
      prisma.user.findUnique({
        where: { id: meId },
        select: { id: true, subscription: true, banned: true, suspended: true },
      }),
      requestModel?.findMany?.({
        where: { ownerId: meId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 200,
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
        },
      }) ?? [],
    ]);

    if (!me) return noStore({ error: "Unauthorized" }, { status: 401 });

    let remaining = 0;
    let cap = capFor((me as any).subscription ?? null);
    let windowStart: Date | null = null;
    let nextReset: Date | null = null;

    if (typeof limitsAny?.getMyRequestQuota === "function") {
      const q = await limitsAny.getMyRequestQuota({ meId });
      remaining = Number(q?.remaining ?? 0);
      cap = Number(q?.cap ?? cap);
      windowStart = q?.windowStart ? new Date(q.windowStart) : null;
      nextReset = q?.nextReset ? new Date(q.nextReset) : null;
    } else {
      // Fallback rolling 24h window
      const now = Date.now();
      const start = new Date(now - 24 * 60 * 60 * 1000);
      windowStart = start;

      const used = await requestModel?.count?.({
        where: { ownerId: meId, createdAt: { gt: start } },
      });

      const usedN = Number(used || 0);
      remaining = Math.max(0, cap - usedN);

      // next reset = oldest request within window + 24h
      const oldest = await requestModel?.findFirst?.({
        where: { ownerId: meId, createdAt: { gt: start } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { createdAt: true },
      });
      if (oldest?.createdAt) {
        nextReset = new Date(new Date(oldest.createdAt).getTime() + 24 * 60 * 60 * 1000);
      } else {
        nextReset = new Date(now + 24 * 60 * 60 * 1000);
      }
    }

    const mine = (Array.isArray(mineRaw) ? mineRaw : []).map((r: any) => ({
      ...r,
      createdAt: toIso(r?.createdAt),
      expiresAt: toIso(r?.expiresAt),
      boostUntil: toIso(r?.boostUntil),
    }));

    return noStore({
      ok: true,
      requests: mine,
      quota: {
        remaining,
        cap,
        windowStart: windowStart ? windowStart.toISOString() : null,
        nextReset: nextReset ? nextReset.toISOString() : null,
      },
      note:
        me.banned || me.suspended ? "posting-disabled" : null,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/requests/mine GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
