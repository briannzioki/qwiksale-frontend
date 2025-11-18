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

    const [usersTotal, productsTotal, servicesTotal] = await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      safeServiceCount(),
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
      })
    );

    log.info({ totals: { usersTotal, productsTotal, servicesTotal } }, "admin_metrics_ok");

    return jsonNoStore({
      totals: {
        users: usersTotal,
        products: productsTotal,
        services: servicesTotal,
        reveals: null,
      },
      last7d,
    });
  });
}
