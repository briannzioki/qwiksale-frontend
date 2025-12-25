export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { MetadataRoute } from "next";

/** Resolve a canonical absolute base URL (no trailing slash). */
function siteUrl(): string {
  const raw =
    process.env["NEXT_PUBLIC_SITE_URL"] ||
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

const MAX_LINKS = 45_000;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const SITEMAP_TAKE = clamp(Number(process.env["SITEMAP_TAKE"] ?? 1200), 100, 5000);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  // Only include clearly-public routes here (avoid gated/private URLs).
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/search`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/help`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/safety`, lastModified: now, changeFrequency: "yearly", priority: 0.35 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/donate`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  if (process.env["SKIP_SITEMAP_DB"] === "1") return staticRoutes;
  if (!hasValidDbUrl()) return staticRoutes;

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
          const anyPrisma = prisma as any;
          const Service =
            anyPrisma.service ??
            anyPrisma.services ??
            anyPrisma.Service ??
            anyPrisma.Services ??
            null;

          if (Service && typeof Service.findMany === "function") {
            return (await Service.findMany({
              where: { status: "ACTIVE" },
              select: { id: true, updatedAt: true },
              take: SITEMAP_TAKE,
              orderBy: { updatedAt: "desc" },
            })) as Array<{ id: string; updatedAt: Date }>;
          }
        } catch {}
        return [] as Array<{ id: string; updatedAt: Date }>;
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
    // eslint-disable-next-line no-console
    console.error("[sitemap.ts] error:", e);
    return staticRoutes;
  }
}
