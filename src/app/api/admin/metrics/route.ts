export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { assertAdmin } from "../_lib/guard";
import { withApiLogging, type RequestLog } from "@/app/lib/api-logging";

/** tiny helper to ensure proper caching/vary on all JSON */
function jsonNoStore(payload: unknown, init?: ResponseInit) {
  const res = NextResponse.json(payload, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}

/** Safely count Service records even if your Prisma schema has no `Service` model yet. */
async function safeServiceCount(where?: any): Promise<number> {
  const anyPrisma = prisma as any;
  const svc = anyPrisma?.service;
  if (svc && typeof svc.count === "function") {
    return svc.count(where ? { where } : undefined);
  }
  return 0;
}

async function safeCarrierCount(where?: any): Promise<number> {
  const anyPrisma = prisma as any;
  const cp = anyPrisma?.carrierProfile;
  if (cp && typeof cp.count === "function") {
    return cp.count(where ? { where } : undefined);
  }
  return 0;
}

function carrierModelAvailable(): boolean {
  const anyPrisma = prisma as any;
  const cp = anyPrisma?.carrierProfile;
  return Boolean(cp && typeof cp.count === "function");
}

async function loadCarrierOverview(): Promise<null | {
  total: number;
  activeOnline: number;
  suspended: number;
  banned: number;
  byTier: { BASIC: number; GOLD: number; PLATINUM: number };
  byVerification: { UNVERIFIED: number; PENDING: number; VERIFIED: number; REJECTED: number };
  liveCutoffSeconds: number;
}> {
  if (!carrierModelAvailable()) return null;

  const now = new Date();
  const liveCutoffSeconds = 90;
  const liveCutoff = new Date(now.getTime() - liveCutoffSeconds * 1000);

  try {
    const [total, banned, suspended, activeOnline] = await Promise.all([
      safeCarrierCount(),
      safeCarrierCount({ bannedAt: { not: null } }),
      safeCarrierCount({ suspendedUntil: { gt: now } }),
      safeCarrierCount({
        status: "AVAILABLE",
        bannedAt: null,
        OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: now } }],
        lastSeenAt: { gte: liveCutoff },
      }),
    ]);

    const [basic, gold, platinum] = await Promise.all([
      safeCarrierCount({ planTier: "BASIC" }),
      safeCarrierCount({ planTier: "GOLD" }),
      safeCarrierCount({ planTier: "PLATINUM" }),
    ]);

    const [unverified, pending, verified, rejected] = await Promise.all([
      safeCarrierCount({ verificationStatus: "UNVERIFIED" }),
      safeCarrierCount({ verificationStatus: "PENDING" }),
      safeCarrierCount({ verificationStatus: "VERIFIED" }),
      safeCarrierCount({ verificationStatus: "REJECTED" }),
    ]);

    return {
      total,
      activeOnline,
      suspended,
      banned,
      byTier: { BASIC: basic, GOLD: gold, PLATINUM: platinum },
      byVerification: {
        UNVERIFIED: unverified,
        PENDING: pending,
        VERIFIED: verified,
        REJECTED: rejected,
      },
      liveCutoffSeconds,
    };
  } catch (e) {
    console.error("[admin-metrics-overview] carrier metrics failed:", e);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;

  return withApiLogging(req, "/api/admin/metrics", async (log: RequestLog) => {
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      return d;
    });

    const [usersTotal, productsTotal, servicesTotal, carriers] = await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      safeServiceCount(),
      loadCarrierOverview(),
    ]);

    const last7d = await Promise.all(
      days.map(async (d) => {
        const next = new Date(d);
        next.setDate(d.getDate() + 1);

        const [u, p, s] = await Promise.all([
          prisma.user.count({ where: { createdAt: { gte: d, lt: next } } }),
          prisma.product.count({ where: { createdAt: { gte: d, lt: next } } }),
          safeServiceCount({ createdAt: { gte: d, lt: next } }),
        ]);

        return {
          date: d.toISOString().slice(0, 10),
          users: u,
          products: p,
          services: s,
        };
      }),
    );

    log.info(
      { totals: { usersTotal, productsTotal, servicesTotal, carriers: carriers ? carriers.total : null } },
      "admin_metrics_ok",
    );

    return jsonNoStore({
      totals: {
        users: usersTotal,
        products: productsTotal,
        services: servicesTotal,
        reveals: null,
        carriers: carriers ?? null,
      },
      last7d,
    });
  });
}
