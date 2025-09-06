// next.config.ts
import { withSentryConfig } from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";
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

  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-DNS-Prefetch-Control", value: "on" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    ...(isProd
      ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
      : []),
  ];
};

/* ------------- Optional Sentry tunnel rewrite (/monitoring) ------------- */
function getSentryTunnelRewrite() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || "";
  const m = dsn.match(/^https?:\/\/[^@]+@([^/]+)\/(\d+)$/i);
  if (!m) return null;
  const host = m[1];      // e.g. o123456.ingest.sentry.io
  const projectId = m[2]; // e.g. 4509963654922320
  return {
    source: "/monitoring",
    destination: `https://${host}/api/${projectId}/envelope/`,
  };
}

/* ---------------------------- Next.js config ---------------------------- */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: cloudName ? `/${cloudName}/**` : "/**",
      },
      { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
      { protocol: "https", hostname: "plus.unsplash.com", pathname: "/**" },
      { protocol: "https", hostname: "images.pexels.com", pathname: "/**" },
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
    ],
    dangerouslyAllowSVG: true,
  },

  eslint: { ignoreDuringBuilds: true },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(),
      },
    ];
  },

  // NOTE: Avoid importing Next types here; their internal unions vary between versions.
  async redirects() {
    const rules: any[] = [];

    if (APEX_DOMAIN) {
      rules.push({
        source: "/:path*",
        destination: `https://${APEX_DOMAIN}/:path*`,
        permanent: true,
        has: [
          {
            type: "host",
            key: "host", // required by Next’s route matching for 'has'
            value: `www.${APEX_DOMAIN}`,
          },
        ],
      });
    }

    return rules as any;
  },

  async rewrites() {
    const out: any[] = [];
    const tunnel = getSentryTunnelRewrite();
    if (tunnel) out.push(tunnel);
    return out as any;
  },
};

/* ------------------------------ Sentry wrap ------------------------------ */
// v8+: exactly two args
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
});
