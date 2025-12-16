// src/app/api/admin/metrics/overview/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { getViewer } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { err, noStore } from "@/app/api/_lib/http";

// Tiny helper to avoid pulling in date-fns just for this
function subDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

async function safeModelCount(model: any, where: any): Promise<number> {
  try {
    if (!model || typeof model.count !== "function") return 0;
    const n = await model.count({ where });
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    console.error("[api/admin/metrics/overview] count failed:", e);
    return 0;
  }
}

export async function GET() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return err(403, "forbidden");

  const since = subDays(new Date(), 30);

  const anyPrisma = prisma as any;

  const [newUsers, newProducts, newServices, productReveals] = await Promise.all([
    safeModelCount(anyPrisma.user, { createdAt: { gte: since } }),
    safeModelCount(anyPrisma.product, { createdAt: { gte: since } }),
    safeModelCount(anyPrisma.service, { createdAt: { gte: since } }),
    safeModelCount(anyPrisma.contactReveal, { createdAt: { gte: since } }),
  ]);

  return noStore({
    ok: true,
    stats: {
      newUsers,
      newProducts,
      newServices,
      productReveals,
    },
  });
}
