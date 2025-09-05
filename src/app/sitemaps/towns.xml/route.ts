// src/app/sitemaps/towns.xml/route.ts
export const runtime = "nodejs";
export const revalidate = 3600; // cache 1h

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

function sitemapXml(urls: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `<url>
  <loc>${u}</loc>
</url>`
  )
  .join("\n")}
</urlset>`;
}

export async function GET() {
  try {
    // Fetch distinct towns from Product.location
    const rows = await prisma.product.findMany({
      where: { status: "ACTIVE", location: { not: null } },
      select: { location: true },
      distinct: ["location"],
      take: 5000,
    });

    // Explicit type annotation so 'r' isn't 'any'
    const towns = (rows as Array<{ location: string | null }>)
      .map((r: { location: string | null }) => r.location?.trim() ?? "")
      .filter((loc: string) => loc.length > 0);

    const base = (process.env.NEXT_PUBLIC_APP_URL || "https://qwiksale.sale").replace(/\/+$/, "");

    const urls: string[] = towns.map((loc: string) => `${base}/town/${encodeURIComponent(loc)}`);

    const xml = sitemapXml(urls);

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[sitemaps/towns] error:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
