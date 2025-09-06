/* next.config.js */
const { withSentryConfig } = require("@sentry/nextjs");

/**
 * Build a tunnel rewrite from /monitoring to the Sentry ingest endpoint
 * by parsing SENTRY_DSN (or NEXT_PUBLIC_SENTRY_DSN).
 * DSN format: https://<key>@o<orgId>.ingest.sentry.io/<projectId>
 */
function getSentryTunnelRewrite() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || "";
  const m = dsn.match(/^https?:\/\/[^@]+@([^/]+)\/(\d+)$/i);
  if (!m) return null;
  const host = m[1];      // e.g. o123456.ingest.sentry.io
  const projectId = m[2]; // e.g. 4509963654922320
  return { source: "/monitoring", destination: `https://${host}/api/${projectId}/envelope/` };
}

const isProd = process.env.NODE_ENV === "production";
const isPreview = process.env.VERCEL_ENV === "preview";

/** Optional: set this to your apex domain to auto-redirect www → apex */
const APEX_DOMAIN = process.env.NEXT_PUBLIC_APEX_DOMAIN || "qwiksale.sale";

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  poweredByHeader: false,
  compress: true,
  // Avoid unnecessary revalidation unless you opt in per route/file
  devIndicators: { appIsrStatus: false },

  // Only generate source maps in CI/production (Sentry will pick them up)
  productionBrowserSourceMaps: !!process.env.SENTRY_AUTH_TOKEN,

  // Image optimization allow-list (expand as you add hosts)
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" }, // Google avatars
      { protocol: "https", hostname: "avatars.githubusercontent.com" }, // GH avatars (if any)
    ],
    formats: ["image/avif", "image/webp"],
    // set to true if you want faster local dev without sharp
    // unoptimized: false,
  },

  // Small guardrails for build steps
  eslint: {
    // Let CI run lint separately; don’t block prod builds
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Don’t block prod builds if you’re migrating; keep CI as the gate
    ignoreBuildErrors: isPreview, // false on prod, true on preview for convenience
  },

  // Rewrites / redirects
  async rewrites() {
    const rules = [];
    const tunnel = getSentryTunnelRewrite();
    if (tunnel) rules.push(tunnel);
    return rules;
  },

  async redirects() {
    const rules = [];

    // Optional: www → apex (308 permanent). Disable by clearing APEX_DOMAIN.
    if (APEX_DOMAIN) {
      rules.push({
        source: "https://www." + APEX_DOMAIN + "/:path*",
        destination: "https://" + APEX_DOMAIN + "/:path*",
        permanent: true,
        has: [{ type: "host", value: "www." + APEX_DOMAIN }],
      });
    }

    // Example: force http → https on Vercel (defensive; Vercel already handles this)
    rules.push({
      source: "/:path*",
      has: [{ type: "header", key: "x-forwarded-proto", value: "http" }],
      destination: "https://" + (APEX_DOMAIN || "qwiksale.sale") + "/:path*",
      permanent: true,
    });

    return rules;
  },

  // Security headers (CSP is already handled in your middleware; keep these lightweight)
  async headers() {
    const headers = [
      {
        source: "/(.*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-Download-Options", value: "noopen" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "X-XSS-Protection", value: "0" }, // modern browsers rely on CSP
          // Note: CSP is set dynamically in middleware to include a nonce
        ],
      },
    ];
    // Don’t index preview deployments
    if (isPreview) {
      headers.push({
        source: "/(.*)",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noimageindex, noarchive" }],
      });
    }
    return headers;
    },

  // Helpful experiments you can toggle as you upgrade Next
  experimental: {
    optimizePackageImports: ["lodash", "date-fns"], // example; remove if unused
    // typedRoutes: true, // enable if you want type-safe route strings
    // serverMinification: true,
  },
};

module.exports = withSentryConfig(
  nextConfig,
  {
    // Sentry build-time options (sourcemaps upload uses SENTRY_AUTH_TOKEN from env)
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: true,
    // widen trace propagation to help stitch client <-> server
    widenClientFileUpload: true,
  },
  {
    // Sentry webpack plugin options
    // Disable if you hit timeouts on Preview; keep on for Prod
    dryRun: !isProd && !process.env.SENTRY_AUTH_TOKEN,
  }
);
