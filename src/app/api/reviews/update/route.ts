// src/app/api/reviews/update/route.ts
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

  const data: any = {};
  if (body.rating != null) {
    const rating = Number(body.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return err(400, "rating must be between 1 and 5");
    }
    data.rating = rating;
  }

  if (typeof body.text === "string") {
    const text = body.text.trim();
    if (text.length > 2000) {
      return err(400, "text too long (max 2000 chars)");
    }
    data.text = text;
  }

  if (!Object.keys(data).length) {
    return err(400, "nothing to update");
  }

  const updated = await prisma.review.update({
    where: { id },
    data,
  });

  return noStore({
    ok: true,
    review: updated,
  });
}
