// src/app/api/reviews/add/route.ts
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

  const listingId = String(body.listingId || "").trim();
  const rawRating = body.rating;
  const rating = Number(rawRating);
  const rawText =
    typeof body.text === "string" ? (body.text as string) : "";
  const text = rawText.trim();
  // Optional, currently unused but accepted for future logic
  const listingType: string | undefined =
    typeof body.listingType === "string"
      ? body.listingType
      : undefined;

  if (!listingId) {
    return err(400, "listingId required");
  }

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return err(400, "rating must be between 1 and 5");
  }

  if (text.length > 2000) {
    return err(400, "text too long (max 2000 chars)");
  }

  const cleanText = text || "";

  // Single review per user per listing: update existing instead of spamming duplicates
  const existing = await prisma.review.findFirst({
    where: {
      raterId: viewer.id,
      listingId,
    },
  });

  let review;
  let mode: "created" | "updated" = "created";

  if (existing) {
    review = await prisma.review.update({
      where: { id: existing.id },
      data: {
        rating,
        text: cleanText,
      },
    });
    mode = "updated";
  } else {
    review = await prisma.review.create({
      data: {
        raterId: viewer.id,
        // You can later point this at the listing owner; default to self for now.
        rateeId: viewer.id,
        listingId,
        rating,
        text: cleanText,
        // If you add a `listingType` column in Prisma, wire it here:
        // listingType,
      },
    });
  }

  return noStore({ ok: true, mode, review });
}
