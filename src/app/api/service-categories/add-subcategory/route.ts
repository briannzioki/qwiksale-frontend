// src/app/api/service-categories/add-subcategory/route.ts
export const runtime = "nodejs";

import { prisma } from "@/app/lib/prisma";
import { getViewer } from "@/app/lib/auth";
import { err, noStore } from "@/app/api/_lib/http";

const db = prisma as any;

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return err(401, "not authenticated");

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return err(400, "invalid json");
  }

  const categoryId = String(body.categoryId || "").trim();
  const name = String(body.name || "").trim();

  if (!categoryId || !name) return err(400, "missing fields");

  const sub = await db.serviceSubcategory.create({
    data: { categoryId, name },
  });

  return noStore({ ok: true, sub });
}
