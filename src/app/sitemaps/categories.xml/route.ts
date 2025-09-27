export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 3600; // cache 1h at the edge/CDN

import { NextResponse } from "next/server";

/** Resolve a canonical absolute base URL (no trailing slash). */
function getBaseUrl(): string {
  const raw =
    process.env["NEXT_PUBLIC_APP_URL"] ||
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

function buildMinimal(): string {
  const base = getBaseUrl();
  return buildSitemapXml([`${base}/`, `${base}/search`]);
}

function hasValidDbUrl(): boolean {
  const u = process.env["DATABASE_URL"] ?? "";
  return /^postgres(ql)?:\/\//i.test(u);
}

function shouldSkipDb(): boolean {
  return process.env["SKIP_SITEMAP_DB"] === "1";
}

export async function GET() {
  if (!hasValidDbUrl() || shouldSkipDb()) {
    return new NextResponse(buildMinimal(), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600",
      },
    });
  }

  try {
    const { prisma } = await import("@/app/lib/prisma");

    // Distinct categories of ACTIVE products only (cap to keep memory low)
    const rows = await prisma.product.findMany({
      where: { status: "ACTIVE" },
      select: { category: true },
      distinct: ["category"],
      take: 2000, // lower cap
    });

    const categories = (rows as Array<{ category: string | null }>)
      .map((r) => (r.category ?? "").trim())
      .filter((c) => c.length > 0);

    const base = getBaseUrl();
    const urls = categories.map((c) => `${base}/category/${encodeURIComponent(c)}`);
    const xml = buildSitemapXml(urls);

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600",
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[sitemaps/categories] error:", e);
    return new NextResponse(buildMinimal(), {
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }
}
