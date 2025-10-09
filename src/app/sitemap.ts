export const runtime = "nodejs";
// dynamic here doesn't stop Next from evaluating at build time for sitemap,
// but we keep it for consistency.
export const dynamic = "force-dynamic";

import type { MetadataRoute } from "next";

/** Resolve a canonical absolute base URL (no trailing slash). */
function siteUrl(): string {
  const raw =
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["APP_ORIGIN"] ||
    process.env["NEXTAUTH_URL"] ||
    "https://qwiksale.sale";
  const trimmed = String(raw).trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : "https://qwiksale.sale";
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

  // Static, always-present URLs
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/search`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/sell`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    // Legal pages (indexable)
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    // Low-priority account subpage (kept, but search engines may de-prioritize)
    { url: `${base}/account/billing`, lastModified: now, changeFrequency: "monthly", priority: 0.2 },
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
          // service model might not exist on some deployments
          // ts-expect-error – tolerate missing model at runtime
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

    // Deduplicate & cap
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
    return staticRoutes;
  }
}
