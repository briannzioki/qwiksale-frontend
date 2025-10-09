// src/app/robots.ts
import type { MetadataRoute } from "next";

function siteUrl() {
  const env =
    process.env["NEXT_PUBLIC_APP_URL"] ||
    process.env["APP_ORIGIN"] ||
    process.env["NEXTAUTH_URL"] ||
    "https://qwiksale.co";

  // Robustly normalize to an origin (handles values with/without protocol)
  let base: string;
  try {
    base = new URL(env).origin;
  } catch {
    base = "https://qwiksale.co";
  }
  return base.replace(/\/+$/, "");
}

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  const disallow = [
    // APIs
    "/api",
    "/api/",
    // Admin
    "/admin",
    "/admin/",
    // App-private areas
    "/dashboard",
    "/dashboard/",
    "/account",
    "/account/",
    "/messages",
    "/messages/",
    "/sell",
    "/sell/",
    "/signin",
    "/signin/",
    "/signup",
    "/signup/",
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow,
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
