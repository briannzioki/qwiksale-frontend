// src/app/api/service-categories/list/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { prisma } from "@/app/lib/prisma";
import { noStore } from "@/app/api/_lib/http";

// Cast once so this keeps compiling even if Prisma types lag behind schema
const db = prisma as any;

export async function GET() {
  const rows = await db.serviceCategory.findMany({
    orderBy: { name: "asc" },
    include: { subs: { orderBy: { name: "asc" } } },
  });

  return noStore({ ok: true, categories: rows });
}
