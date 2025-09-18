// src/app/sitemaps/towns.xml/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 3600; // cache 1h

import { NextResponse } from "next/server";

/** Resolve a canonical absolute base URL (no trailing slash). */
function getBaseUrl(): string {
  const raw =
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    "https://qwiksale.sale";
  const trimmed = String(raw).trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : "https://qwiksale.sale";
}

/** Minimal XML escaper for <loc> contents. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;");
}

function buildSitemapXml(urls: string[]): string {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  const body = unique.map((u) => `<url><loc>${xmlEscape(u)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

/** Minimal fallback when DB isn’t available. */
function buildMinimal(): string {
  const base = getBaseUrl();
  return buildSitemapXml([`${base}/`, `${base}/search`]);
}

function hasValidDbUrl(): boolean {
  const u = process.env["DATABASE_URL"] ?? "";
  return /^postgres(ql)?:\/\//i.test(u);
}

const CACHE_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600",
  Vary: "Accept-Encoding",
} as const;

export async function GET() {
  if (!hasValidDbUrl()) {
    // No DB during build/preview/local → safe, small sitemap
    return new NextResponse(buildMinimal(), { headers: CACHE_HEADERS });
  }

  try {
    // Import prisma only when DB looks valid
    const { prisma } = await import("@/app/lib/prisma");

    // Distinct locations (towns) for ACTIVE products only.
    const rows = await prisma.product.findMany({
      where: { status: "ACTIVE", location: { not: null } },
      select: { location: true },
      distinct: ["location"],
      take: 5000, // safety cap
    });

    // Normalize & filter
    const towns = (rows as Array<{ location: string | null }>)
      .map((r) => (r.location ?? "").trim())
      .filter((loc) => loc.length > 0);

    const base = getBaseUrl();
    const urls = towns.map((loc) => `${base}/town/${encodeURIComponent(loc)}`);
    const xml = buildSitemapXml(urls);

    return new NextResponse(xml, { headers: CACHE_HEADERS });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[sitemaps/towns] error:", e);
    // Fail closed with a valid, small sitemap
    return new NextResponse(buildMinimal(), { headers: CACHE_HEADERS });
  }
}
