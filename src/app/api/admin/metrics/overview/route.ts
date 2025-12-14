// src/app/api/admin/metrics/overview/route.ts
import { getViewer } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { err, noStore } from "@/app/api/_lib/http";

// Tiny helper to avoid pulling in date-fns just for this
function subDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

export async function GET() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return err(403, "forbidden");

  const since = subDays(new Date(), 30);

  const newUsers = await prisma.user.count({
    where: { createdAt: { gte: since } },
  });

  const newProducts = await prisma.product.count({
    where: { createdAt: { gte: since } },
  });

  const newServices = await prisma.service.count({
    where: { createdAt: { gte: since } },
  });

  const productReveals =
    await prisma.contactReveal.count({
      where: { createdAt: { gte: since } },
    });

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
