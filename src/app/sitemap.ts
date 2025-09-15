// src/app/sitemap.ts (or wherever this file lives)
import type { MetadataRoute } from "next";
import { prisma } from "@/app/lib/prisma";

function siteUrl() {
  return (
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    "https://qwiksale.co"
  ).replace(/\/+$/, "");
}

/** Optional, TS-safe alias so builds pass even if Service isn't generated yet */
type PrismaCompat = typeof prisma & {
  service?: {
    findMany: (args: {
      where?: any;
      select?: { id: true; updatedAt: true };
      take?: number;
      orderBy?: any;
    }) => Promise<Array<{ id: string; updatedAt: Date }>>;
  };
};
const db = prisma as PrismaCompat;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  // Static entries you want indexed
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/sell`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/browse`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/account/billing`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];

  // Fetch identifiers only, keep it cheap
  const [products, services] = await Promise.all([
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, updatedAt: true },
      take: 5000, // safety cap
      orderBy: { updatedAt: "desc" },
    }) as Promise<Array<{ id: string; updatedAt: Date }>>,
    // If the Service model isn't in the generated client yet, return []
    db.service
      ? db.service.findMany({
          where: { status: "ACTIVE" },
          select: { id: true, updatedAt: true },
          take: 5000,
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([] as Array<{ id: string; updatedAt: Date }>),
  ]);

  const productUrls: MetadataRoute.Sitemap = products.map(
    (p: { id: string; updatedAt: Date }) => ({
      url: `${base}/product/${encodeURIComponent(p.id)}`,
      lastModified: p.updatedAt,
      changeFrequency: "daily",
      priority: 0.8,
    })
  );

  const serviceUrls: MetadataRoute.Sitemap = services.map(
    (s: { id: string; updatedAt: Date }) => ({
      url: `${base}/service/${encodeURIComponent(s.id)}`,
      lastModified: s.updatedAt,
      changeFrequency: "daily",
      priority: 0.75,
    })
  );

  return [...staticRoutes, ...productUrls, ...serviceUrls];
}
