// src/app/api/admin/listings/suspend/route.ts
import { getViewer } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { err, noStore } from "@/app/api/_lib/http";

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return err(403, "forbidden");

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return err(400, "invalid json");
  }

  const id = String(body.id || "");
  const type = String(body.type || "product");

  if (!id) return err(400, "missing id");

  if (type === "product") {
    await prisma.product.update({
      where: { id },
      data: { status: "HIDDEN" },
    });
  } else {
    await prisma.service.update({
      where: { id },
      data: { status: "HIDDEN" },
    });
  }

  return noStore({ ok: true, id, type });
}
