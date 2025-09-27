// src/app/sitemap.ts
export const runtime = "nodejs";
// dynamic here doesn't stop Next from evaluating at build time for sitemap,
// but we keep it for consistency.
export const dynamic = "force-dynamic";

import type { MetadataRoute } from "next";

function siteUrl(): string {
  return (
    process.env["NEXT_PUBLIC_APP_URL"] ||
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

/** Clamp helper */
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Allow tuning via env and keep it small to reduce build memory. */
const SITEMAP_TAKE = clamp(Number(process.env["SITEMAP_TAKE"] ?? 1200), 100, 5000);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/sell`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/browse`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/account/billing`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  // Hard skip if requested (useful for tight-memory builds)
  if (process.env["SKIP_SITEMAP_DB"] === "1") {
    return staticRoutes;
  }

  if (!hasValidDbUrl()) {
    return staticRoutes;
  }

  try {
    const { prisma } = await import("@/app/lib/prisma");

    const [products, services] = await Promise.all([
      prisma.product.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, updatedAt: true },
        take: SITEMAP_TAKE,
        orderBy: { updatedAt: "desc" },
      }) as Promise<Array<{ id: string; updatedAt: Date }>>,
      (async () => {
        try {
          // ts-expect-error: service model might not exist
          return (await prisma.service.findMany({
            where: { status: "ACTIVE" },
            select: { id: true, updatedAt: true },
            take: SITEMAP_TAKE,
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
    console.error("[sitemap.ts] error:", e);
    return staticRoutes;
  }
}
