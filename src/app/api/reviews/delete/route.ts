// src/app/api/reviews/delete/route.ts
import { getViewer } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { err, noStore } from "@/app/api/_lib/http";

export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.id) return err(401, "not authenticated");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err(400, "invalid json");
  }

  const id = String(body.id || "").trim();
  if (!id) return err(400, "id required");

  const review = await prisma.review.findUnique({
    where: { id },
  });

  if (!review) {
    return err(404, "not found");
  }

  const v: any = viewer;
  const isOwner = review.raterId === viewer.id;
  const isAdmin =
    v?.role === "ADMIN" ||
    v?.role === "admin" ||
    Boolean(v?.isAdmin);

  if (!isOwner && !isAdmin) {
    return err(403, "forbidden");
  }

  await prisma.review.delete({
    where: { id },
  });

  return noStore({
    ok: true,
    id,
  });
}
