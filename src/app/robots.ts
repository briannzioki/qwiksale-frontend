﻿// src/app/robots.ts
import type { MetadataRoute } from "next";

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

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // non-indexable areas
          "/api/",
          "/signin",
          "/signup",
          "/account",
          "/dashboard",
          "/messages",
          "/profile",
          "/_next/",
          "/static/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
