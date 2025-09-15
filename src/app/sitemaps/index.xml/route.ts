// src/app/sitemaps/index.xml/route.ts
export const runtime = "nodejs";
export const revalidate = 3600;

import { NextResponse } from "next/server";

function getBaseUrl(): string {
  const raw =
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    "https://qwiksale.co";
  const trimmed = String(raw).trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : "https://qwiksale.co";
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;");
}

function sitemapIndex(urls: string[]): string {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  const items = unique
    .map((u) => `<sitemap><loc>${xmlEscape(u)}</loc></sitemap>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</sitemapindex>`;
}

export async function GET() {
  try {
    const base = getBaseUrl();
    const urls = [
      `${base}/sitemaps/towns.xml`,
      `${base}/sitemaps/categories.xml`,
      // add more child sitemaps here
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
    console.error("[/sitemaps/index.xml] error:", e);
    return new NextResponse("Server error", { status: 500 });
  }
}
