// src/app/sitemap.xml/route.ts
export const runtime = "nodejs";
export const revalidate = 3600; // cache 1h

import { NextResponse } from "next/server";

/** Ensure we always have an absolute base like https://example.com (no trailing slash). */
function getBaseUrl(): string {
  const raw =
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    "https://qwiksale.sale";
  // trim whitespace and trailing slashes
  const trimmed = String(raw).trim().replace(/\/+$/, "");
  // basic sanity: require http(s)
  if (!/^https?:\/\//i.test(trimmed)) {
    return "https://qwiksale.sale";
  }
  return trimmed;
}

function sitemapIndex(urls: string[]): string {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  const items = unique
    .map(
      (u) => `<sitemap>
  <loc>${u}</loc>
</sitemap>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</sitemapindex>`;
}

export async function GET() {
  try {
    const base = getBaseUrl();

    // Add/extend as you grow (e.g., products.xml, static.xml, users.xml, etc.)
    const urls: string[] = [
      `${base}/sitemaps/towns.xml`,
      `${base}/sitemaps/categories.xml`,
    ];

    const xml = sitemapIndex(urls);

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600",
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[sitemap.xml] error:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
