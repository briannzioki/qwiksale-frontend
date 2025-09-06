// next.config.ts
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";
const isPreview = process.env.VERCEL_ENV === "preview";
const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "";
const APEX_DOMAIN = process.env.NEXT_PUBLIC_APEX_DOMAIN || "qwiksale.sale";

/* --------------------- Security headers (CSP etc.) --------------------- */
const securityHeaders = (): { key: string; value: string }[] => {
  const connect = [
    "'self'",
    "https://api.cloudinary.com",
    "https://sandbox.safaricom.co.ke",
    "https://api.safaricom.co.ke",
    "https://accounts.google.com",
    "https://www.googleapis.com",
    "https://plausible.io",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
    ...(isProd ? [] : ["ws:", "wss:"]),
  ].join(" ");

  const img = [
    "'self'",
    "data:",
    "blob:",
    "https://res.cloudinary.com",
    "https://lh3.googleusercontent.com",
    "https://images.unsplash.com",
    "https://plus.unsplash.com",
    "https://images.pexels.com",
    "https://picsum.photos",
  ].join(" ");

  const script = [
    "'self'",
    "'unsafe-inline'",
    "https://plausible.io",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://accounts.google.com",
    ...(isProd ? [] : ["'unsafe-eval'"]),
  ].join(" ");

  const style = ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"].join(" ");
  const font = ["'self'", "data:", "https://fonts.gstatic.com"].join(" ");
  const frameSrc = ["'self'", "https://accounts.google.com"].join(" ");

  const csp = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    `img-src ${img}`,
    `connect-src ${connect}`,
    `script-src ${script}`,
    `style-src ${style}`,
    `font-src ${font}`,
    `frame-src ${frameSrc}`,
    `form-action 'self' https://accounts.google.com`,
    isProd ? `upgrade-insecure-requests` : ``,
  ]
    .filter(Boolean)
    .join("; ");

  const base = [
    { key: "Content-Security-Policy", value: csp },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-DNS-Prefetch-Control", value: "on" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    // light extra hardening:
    { key: "X-Download-Options", value: "noopen" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    { key: "X-XSS-Protection", value: "0" },
  ];

  return isProd
    ? [...base, { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : base;
};

/* ------------- Optional Sentry tunnel rewrite (/monitoring) ------------- */
function getSentryTunnelRewrite() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || "";
  const m = dsn.match(/^https?:\/\/[^@]+@([^/]+)\/(\d+)$/i);
  if (!m) return null;
  const host = m[1];      // e.g. o123456.ingest.sentry.io
  const projectId = m[2]; // e.g. 4509963...
  return { source: "/monitoring", destination: `https://${host}/api/${projectId}/envelope/` };
}

/* ---------------------------- Next.js config ---------------------------- */
const baseConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  productionBrowserSourceMaps: !!process.env.SENTRY_AUTH_TOKEN,

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com", pathname: cloudName ? `/${cloudName}/**` : "/**" },
      { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
      { protocol: "https", hostname: "plus.unsplash.com", pathname: "/**" },
      { protocol: "https", hostname: "images.pexels.com", pathname: "/**" },
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
      { protocol: "https", hostname: "avatars.githubusercontent.com", pathname: "/**" },
    ],
    formats: ["image/avif", "image/webp"],
    dangerouslyAllowSVG: true,
  },

  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: isPreview },

  async headers() {
    const rules = [{ source: "/:path*", headers: securityHeaders() }];
    if (isPreview) {
      rules.push({
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noimageindex, noarchive" }],
      });
    }
    return rules;
  },

  async redirects() {
    const rules: Array<{
      source: string;
      destination: string;
      permanent: boolean;
      has?: Array<
        | { type: "host"; value: string } // NOTE: host does NOT take a `key`
        | { type: "header" | "cookie" | "query"; key: string; value?: string }
      >;
      missing?: Array<{ type: "header" | "cookie" | "query"; key: string; value?: string }>;
    }> = [];

    // www → apex (308) using `has: [{ type: 'host', value: 'www.example.com' }]`
    if (APEX_DOMAIN) {
      rules.push({
        source: "/:path*",
        destination: `https://${APEX_DOMAIN}/:path*`,
        permanent: true,
        has: [{ type: "host", value: `www.${APEX_DOMAIN}` }], // ✅ no `key` here
      });
    }

    // Optional: force http → https (Vercel already does this, but harmless)
    rules.push({
      source: "/:path*",
      destination: `https://${APEX_DOMAIN}/:path*`,
      permanent: true,
      has: [{ type: "header", key: "x-forwarded-proto", value: "http" }],
    });

    return rules;
  },

  async rewrites() {
    const rules: { source: string; destination: string }[] = [];
    const tunnel = getSentryTunnelRewrite();
    if (tunnel) rules.push(tunnel);
    return rules;
  },

  experimental: {
    optimizePackageImports: ["lodash", "date-fns"],
  },
};

/* ------------------------------ Sentry wrap ------------------------------ */
export default withSentryConfig(baseConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
});
