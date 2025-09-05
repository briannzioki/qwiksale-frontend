// src/app/sitemaps/categories.xml/route.ts
export const runtime = "nodejs";
export const revalidate = 3600; // cache 1h

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

function buildSitemapXml(urls: string[]): string {
  const body = urls
    .map((u) => {
      const loc = u.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
      return `<url><loc>${loc}</loc></url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

export async function GET() {
  try {
    // Keep the query simple: get distinct categories for ACTIVE products
    const rows = await prisma.product.findMany({
      where: { status: "ACTIVE" },
      select: { category: true },
      distinct: ["category"],
      take: 5000,
    });

    // Filter out null/empty/whitespace categories in JS
    const categories = (rows as Array<{ category: string | null }>)
      .map((r) => (r.category ?? "").trim())
      .filter((c) => c.length > 0);

    const base = (process.env.NEXT_PUBLIC_APP_URL || "https://qwiksale.sale").replace(/\/+$/, "");
    const urls = categories.map((c) => `${base}/category/${encodeURIComponent(c)}`);

    const xml = buildSitemapXml(urls);
    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    console.error("[sitemaps/categories] error:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
