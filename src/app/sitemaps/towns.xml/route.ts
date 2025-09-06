// src/app/sitemaps/towns.xml/route.ts
export const runtime = "nodejs";
export const revalidate = 3600; // cache 1h

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

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
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
>
${body}
</urlset>`;
}

export async function GET() {
  try {
    // Distinct locations (towns) for ACTIVE products only.
    const rows = await prisma.product.findMany({
      where: { status: "ACTIVE", location: { not: null } },
      select: { location: true },
      distinct: ["location"],
      take: 5000, // safety cap
    });

    // Normalize & filter locations
    const towns = (rows as Array<{ location: string | null }>)
      .map((r) => (r.location ?? "").trim())
      .filter((loc) => loc.length > 0);

    const base = getBaseUrl();
    const urls = towns.map((loc) => `${base}/town/${encodeURIComponent(loc)}`);

    const xml = buildSitemapXml(urls);

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        // CDN/browser caching with SWR; mirrors the top-level `revalidate`
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600",
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[sitemaps/towns] error:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
