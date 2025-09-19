// src/app/sitemap.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { MetadataRoute } from "next";

function siteUrl(): string {
  return (
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    "https://qwiksale.sale"
  ).replace(/\/+$/, "");
}

function hasValidDbUrl(): boolean {
  const u = process.env["DATABASE_URL"] ?? "";
  return /^postgres(ql)?:\/\//i.test(u);
}

/** Keep well under the 50k per-file sitemap limit. */
const MAX_LINKS = 45_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  // Always-emit static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`,               lastModified: now, changeFrequency: "daily",   priority: 1 },
    { url: `${base}/sell`,           lastModified: now, changeFrequency: "weekly",  priority: 0.6 },
    { url: `${base}/browse`,         lastModified: now, changeFrequency: "daily",   priority: 0.7 },
    { url: `${base}/account/billing`,lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  if (!hasValidDbUrl()) {
    // No DB in this environment → return static-only sitemap
    return staticRoutes;
  }

  try {
    // Import Prisma only when we know the connection string is valid
    const { prisma } = await import("@/app/lib/prisma");

    // Fetch identifiers only; keep bounded
    const [products, services] = await Promise.all([
      prisma.product.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, updatedAt: true },
        take: 5000,
        orderBy: { updatedAt: "desc" },
      }) as Promise<Array<{ id: string; updatedAt: Date }>>,
      (async () => {
        try {
          // Some schemas won’t have Service — just return []
          // ts-expect-error conditional model presence
          return (await prisma.service.findMany({
            where: { status: "ACTIVE" },
            select: { id: true, updatedAt: true },
            take: 5000,
            orderBy: { updatedAt: "desc" },
          })) as Array<{ id: string; updatedAt: Date }>;
        } catch {
          return [] as Array<{ id: string; updatedAt: Date }>;
        }
      })(),
    ]);

    const productUrls: MetadataRoute.Sitemap = products.map((p) => ({
      url: `${base}/product/${encodeURIComponent(p.id)}`,
      lastModified: p.updatedAt,
      changeFrequency: "daily",
      priority: 0.8,
    }));

    const serviceUrls: MetadataRoute.Sitemap = services.map((s) => ({
      url: `${base}/service/${encodeURIComponent(s.id)}`,
      lastModified: s.updatedAt,
      changeFrequency: "daily",
      priority: 0.75,
    }));

    // De-dupe by URL just in case, then cap
    const all = [...staticRoutes, ...productUrls, ...serviceUrls];
    const seen = new Set<string>();
    const deduped: MetadataRoute.Sitemap = [];
    for (const item of all) {
      if (!seen.has(item.url)) {
        seen.add(item.url);
        deduped.push(item);
        if (deduped.length >= MAX_LINKS) break;
      }
    }

    return deduped;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[sitemap.ts] error:", e);
    // Fail closed with a valid static sitemap
    return staticRoutes;
  }
}
