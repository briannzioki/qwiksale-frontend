// src/app/api/reviews/list/route.ts
import { prisma } from "@/app/lib/prisma";
import { err, noStore } from "@/app/api/_lib/http";

function clampInt(
  value: unknown,
  def: number,
  min: number,
  max: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const listingId = String(
    url.searchParams.get("listingId") || "",
  ).trim();
  const listingType =
    url.searchParams.get("listingType") || undefined;

  if (!listingId) {
    return err(400, "listingId required");
  }

  const page = clampInt(
    url.searchParams.get("page"),
    1,
    1,
    10_000,
  );
  const pageSize = clampInt(
    url.searchParams.get("pageSize"),
    10,
    1,
    50,
  );
  const skip = (page - 1) * pageSize;

  const where: any = { listingId };
  if (listingType) {
    // If you later add a listingType column, wire it here:
    // where.listingType = listingType;
  }

  const [items, agg] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.review.aggregate({
      where,
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);

  const total = agg._count._all || 0;
  const totalPages =
    total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));

  // Attach basic author info from User without relying on Prisma relations
  const raterIds = Array.from(
    new Set(
      items
        .map((r: any) => r.raterId)
        .filter((id) => typeof id === "string"),
    ),
  ) as string[];

  const users = raterIds.length
    ? await prisma.user.findMany({
        where: { id: { in: raterIds } },
        select: {
          id: true,
          name: true,
          username: true,
          image: true,
        },
      })
    : [];

  const userMap = new Map<string, (typeof users)[number]>(
    users.map((u) => [u.id, u]),
  );

  const enriched = items.map((r: any) => {
    const raterId =
      typeof r.raterId === "string" ? r.raterId : undefined;
    const u = raterId ? userMap.get(raterId) : undefined;

    return {
      ...r,
      authorName: u?.name || u?.username || null,
      authorUsername: u?.username || null,
      authorAvatar: u?.image || null,
    };
  });

  const average = agg._avg.rating ?? 0;

  return noStore({
    ok: true,
    listingId,
    listingType: listingType ?? null,
    page,
    pageSize,
    total,
    totalPages,
    items: enriched,
    stats: {
      average,
      count: total,
    },
  });
}
