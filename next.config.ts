// next.config.ts
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import bundleAnalyzer from "@next/bundle-analyzer";

const withAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

const isProd = process.env.NODE_ENV === "production";
const isPreview = process.env.VERCEL_ENV === "preview";
const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "";
const APEX_DOMAIN = process.env.NEXT_PUBLIC_APEX_DOMAIN || "qwiksale.sale";

// Local helper type to avoid the readonly inference issue
type HeaderRule = { source: string; headers: { key: string; value: string }[] };

/**
 * NOTE:
 * CSP is now set in `middleware.ts` for HTML navigations (with nonce + strict-dynamic).
 * We intentionally DO NOT send a CSP header here to avoid duplicate/conflicting CSPs.
 */
const securityHeaders = (): { key: string; value: string }[] => {
  const base = [
    // NO: { key: "Content-Security-Policy", value: csp }
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-DNS-Prefetch-Control", value: "on" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: "X-Download-Options", value: "noopen" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    { key: "X-XSS-Protection", value: "0" },
  ];

  return isProd
    ? [...base, { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : base;
};

function getSentryTunnelRewrite() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || "";
  const m = dsn?.match?.(/^https?:\/\/[^@]+@([^/]+)\/(\d+)$/i);
  if (!m) return null;
  const host = m[1];
  const projectId = m[2];
  return { source: "/monitoring", destination: `https://${host}/api/${projectId}/envelope/` };
}

const baseConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  productionBrowserSourceMaps: !!process.env.SENTRY_AUTH_TOKEN,

  images: {
    remotePatterns: [
      // User media (must match API allowlist)
      { protocol: "https", hostname: "res.cloudinary.com", pathname: cloudName ? `/${cloudName}/**` : "/**" },
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },

      // Other first-party/UX images (avatars, auth, placeholders)
      { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
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
    const rules: HeaderRule[] = [
      // Global security headers (CSP intentionally omitted; handled in middleware.ts)
      { source: "/:path*", headers: securityHeaders() },

      // Never cache auth endpoints
      {
        source: "/api/auth/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
    ];

    // Preview env: disallow indexing
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
        | { type: "host"; value: string }
        | { type: "header" | "cookie" | "query"; key: string; value?: string }
      >;
      missing?: Array<{ type: "header" | "cookie" | "query"; key: string; value?: string }>;
    }> = [];

    // Force apex (non-www) — e.g. www.qwiksale.sale → qwiksale.sale
    if (APEX_DOMAIN) {
      rules.push({
        source: "/:path*",
        destination: `https://${APEX_DOMAIN}/:path*`,
        permanent: true,
        has: [{ type: "host", value: `www.${APEX_DOMAIN}` }],
      });
    }

    // Force HTTPS (http → https on apex)
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

export default withSentryConfig(withAnalyzer(baseConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
});
