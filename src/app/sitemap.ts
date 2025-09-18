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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  // Static entries you want indexed (always emitted)
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/sell`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/browse`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/account/billing`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  if (!hasValidDbUrl()) {
    // No DB available in this env (e.g., local build/preview) — return static only
    return staticRoutes;
  }

  try {
    // Import prisma only if DB looks valid
    const { prisma } = await import("@/app/lib/prisma");

    // Fetch identifiers only, keep it cheap and bounded
    const [products, services] = await Promise.all([
      prisma.product.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, updatedAt: true },
        take: 5000,
        orderBy: { updatedAt: "desc" },
      }) as Promise<Array<{ id: string; updatedAt: Date }>>,
      // If Service model doesn't exist in schema, fall back to []
      (async () => {
        try {
          // ts-expect-error – service may not exist in some schemas
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

    return [...staticRoutes, ...productUrls, ...serviceUrls];
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[sitemap.ts] error:", e);
    return staticRoutes;
  }
}
