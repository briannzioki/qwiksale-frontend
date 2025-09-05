import { prisma } from "@/server/db";
import { NextResponse } from "next/server";

function normalize(q: string) {
  return q.trim().toLowerCase();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = normalize(searchParams.get("q") ?? "");
  const town = searchParams.get("town") ?? "";
  const category = searchParams.get("category") ?? "";
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Math.min(50, Number(searchParams.get("pageSize") ?? "20"));
  const offset = (page - 1) * pageSize;

  // expand synonyms (very small set)
  const synonyms = q
    ? await prisma.$queryRaw<{ word: string }[]>`
      SELECT unnest(expands_to) as word FROM "Synonym" WHERE term = ${q}
    `
    : [];

  const qLike = `%${q}%`;
  const filters: string[] = [];
  const params: any[] = [];

  if (town) {
    filters.push(`"town" = $${params.push(town)}`);
  }
  if (category) {
    filters.push(`"category" = $${params.push(category)}`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  // Search by trigram similarity + ilike; boost title over description
  const query = `
    WITH expanded AS (
      SELECT $1::text AS q
      UNION ALL
      SELECT word FROM (VALUES ${synonyms.map((_,i)=>`($${i+2})`).join(",") || "(NULL)"}) AS t(word)
    ),
    scored AS (
      SELECT
        l.*,
        GREATEST(
          similarity(lower(l.title), (SELECT q FROM expanded LIMIT 1)),
          similarity(lower(l.description), (SELECT q FROM expanded LIMIT 1))
        ) AS sim
      FROM "Listing" l
      ${where}
    )
    SELECT * FROM scored
    WHERE ($1 = '' OR sim > 0.2 OR lower(title) ILIKE $3 OR lower(description) ILIKE $3)
    ORDER BY sim DESC NULLS LAST, "createdAt" DESC
    LIMIT $4 OFFSET $5;
  `;

  const paramsAll = [
    q,
    ...synonyms.map(s => s.word),
    qLike,
    pageSize,
    offset
  ];

  const items = await prisma.$queryRawUnsafe<any[]>(query, ...paramsAll);

  // facet counts
  const facetTown = await prisma.$queryRawUnsafe<{ town: string; count: number }[]>(
    `SELECT "town", COUNT(*)::int AS count FROM "Listing" ${where} GROUP BY "town" ORDER BY count DESC LIMIT 20`,
    ...params
  );
  const facetCategory = await prisma.$queryRawUnsafe<{ category: string; count: number }[]>(
    `SELECT "category", COUNT(*)::int AS count FROM "Listing" ${where} GROUP BY "category" ORDER BY count DESC LIMIT 20`,
    ...params
  );

  return new NextResponse(JSON.stringify({ items, facets: { town: facetTown, category: facetCategory } }), {
    headers: { "content-type": "application/json", "cache-control": "public, s-maxage=60, stale-while-revalidate=60" }
  });
}
