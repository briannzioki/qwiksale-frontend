import type { MetadataRoute } from "next";

function siteUrl() {
  return (
    process.env["NEXT_PUBLIC_SITE_URL"] ||
    process.env["NEXT_PUBLIC_APP_URL"] ||
    "https://qwiksale.co"
  ).replace(/\/+$/, "");
}

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/admin/",
          "/dashboard",
          "/account",
          "/messages",
          "/sell",
          "/signin",
          "/signup",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
