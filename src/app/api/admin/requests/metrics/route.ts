// src/app/api/admin/requests/metrics/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function isAdminSession(session: any): boolean {
  const v = session as any;
  const role = v?.user?.role ?? v?.role ?? v?.session?.user?.role;
  const isAdminFlag = Boolean(v?.user?.isAdmin ?? v?.isAdmin ?? v?.session?.user?.isAdmin);
  const r = String(role ?? "").toUpperCase();
  return isAdminFlag || r === "ADMIN" || r === "SUPERADMIN";
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function GET() {
  const session = await auth();
  if (!session) return noStore({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminSession(session)) return noStore({ error: "Forbidden" }, { status: 403 });

  try {
    const requestModel = (prisma as any).request;

    const now = new Date();
    const today = startOfDay(now);
    const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30 = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [createdToday, createdWeek, active, expired, boosted] = await Promise.all([
      requestModel?.count?.({ where: { createdAt: { gte: today } } }) ?? 0,
      requestModel?.count?.({ where: { createdAt: { gte: weekStart } } }) ?? 0,
      requestModel?.count?.({
        where: { expiresAt: { gt: now }, status: { in: ["ACTIVE", "OPEN"] } },
      }) ?? 0,
      requestModel?.count?.({ where: { expiresAt: { lte: now } } }) ?? 0,
      requestModel?.count?.({ where: { boostUntil: { gt: now } } }) ?? 0,
    ]);

    let topCategories: Array<{ category: string; count: number }> = [];

    try {
      const grouped =
        (await requestModel?.groupBy?.({
          by: ["category"],
          where: {
            createdAt: { gte: last30 },
            category: { not: null },
          },
          _count: { category: true },
          orderBy: { _count: { category: "desc" } },
          take: 8,
        })) ?? [];

      topCategories = (Array.isArray(grouped) ? grouped : [])
        .map((g: any) => ({
          category: String(g?.category || "").trim(),
          count: Number(g?._count?.category ?? 0),
        }))
        .filter((x) => x.category && x.count > 0);
    } catch {
      topCategories = [];
    }

    return noStore({
      ok: true,
      now: now.toISOString(),
      created: {
        today: Number(createdToday || 0),
        week: Number(createdWeek || 0),
      },
      counts: {
        active: Number(active || 0),
        expired: Number(expired || 0),
        boosted: Number(boosted || 0),
      },
      topCategories,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[/api/admin/requests/metrics GET] error:", e);
    return noStore({ error: "Server error" }, { status: 500 });
  }
}
