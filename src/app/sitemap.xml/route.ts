export const runtime = "nodejs";
export const revalidate = 3600; // cache 1h

import { NextResponse } from "next/server";

function sitemapIndex(urls: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `<sitemap>
  <loc>${u}</loc>
</sitemap>`
  )
  .join("\n")}
</sitemapindex>`;
}

export async function GET() {
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL || "https://qwiksale.sale";

    const urls = [
      `${base}/sitemaps/towns.xml`,
      `${base}/sitemaps/categories.xml`,
      // 👉 add other sitemaps if you have them, e.g. listings, static pages, etc.
    ];

    const xml = sitemapIndex(urls);

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    console.error("[sitemap.xml] error:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
