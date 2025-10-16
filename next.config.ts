// src/app/next.config.ts (or project root: next.config.ts)
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import bundleAnalyzer from "@next/bundle-analyzer";

const withAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

const isProd = process.env.NODE_ENV === "production";
const isPreview = process.env.VERCEL_ENV === "preview";
const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "";
const APEX_DOMAIN = process.env.NEXT_PUBLIC_APEX_DOMAIN || "qwiksale.sale";

/** Optional CSV list of extra image hosts (hostnames or full URLs). */
const EXTRA_IMAGE_HOSTS = (process.env.NEXT_PUBLIC_IMAGE_HOSTS || "")
  .split(/[,\s]+/)
  .map((s) => s.trim())
  .filter(Boolean);

// Local helper type to avoid the readonly inference issue
type HeaderRule = { source: string; headers: { key: string; value: string }[] };

/**
 * NOTE:
 * CSP for HTML is set in `middleware.ts` (nonce + strict-dynamic).
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

/** Turn a hostname or URL into a Next.js `remotePatterns` entry. */
function toRemotePattern(
  input: string,
  opts?: { pathname?: string; protocols?: Array<"http" | "https"> }
) {
  const pathname = opts?.pathname ?? "/**";
  const protocols = opts?.protocols ?? ["https"];

  try {
    if (input.startsWith("http://") || input.startsWith("https://")) {
      const u = new URL(input);
      return protocols.map((p) => ({ protocol: p, hostname: u.hostname, pathname })) as Array<{
        protocol: "http" | "https";
        hostname: string;
        pathname: string;
      }>;
    }
  } catch {
    // fall through to hostname mode
  }

  return protocols.map((p) => ({ protocol: p, hostname: input, pathname })) as Array<{
    protocol: "http" | "https";
    hostname: string;
    pathname: string;
  }>;
}

/** Build a deduped list of remote image patterns. */
function buildRemotePatterns() {
  const base: Array<{ protocol: "http" | "https"; hostname: string; pathname: string }> = [
    // User media (Cloudinary). If cloudName is set, tightly scope the path.
    { protocol: "https", hostname: "res.cloudinary.com", pathname: cloudName ? `/${cloudName}/**` : "/**" },

    // Stock & avatar sources we actually use
    { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
    { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
    { protocol: "https", hostname: "images.pexels.com", pathname: "/**" },
    { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
    { protocol: "https", hostname: "avatars.githubusercontent.com", pathname: "/**" },

    // First-party domains (apex + www)
    { protocol: "https", hostname: APEX_DOMAIN, pathname: "/**" },
    { protocol: "https", hostname: `www.${APEX_DOMAIN}`, pathname: "/**" },

    // Common CDNs/object stores we might toggle on
    { protocol: "https", hostname: "imagedelivery.net", pathname: "/**" }, // Cloudflare Images
    { protocol: "https", hostname: "s3.amazonaws.com", pathname: "/**" },  // S3 path-style
    { protocol: "https", hostname: "storage.googleapis.com", pathname: "/**" }, // GCS
    { protocol: "https", hostname: "utfs.io", pathname: "/**" }, // UploadThing CDN
  ];

  const dev = [
    ...toRemotePattern("localhost", { protocols: ["http", "https"] }),
    ...toRemotePattern("127.0.0.1", { protocols: ["http", "https"] }),
  ];

  const extra = EXTRA_IMAGE_HOSTS.flatMap((h) =>
    toRemotePattern(h, { protocols: isProd ? ["https"] : ["http", "https"] })
  );

  const seen = new Set<string>();
  const all = [...base, ...dev, ...extra].filter((p) => {
    const key = `${p.protocol}://${p.hostname}${p.pathname}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return all;
}

const baseConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // Upload artifacts only when Sentry token is present
  productionBrowserSourceMaps: !!process.env.SENTRY_AUTH_TOKEN,

  images: {
    // 🔧 Speed up dev: bypass Next image optimizer locally (or when override flag is set).
    //    You can also set NEXT_IMAGE_UNOPTIMIZED=1 in any env to force passthrough.
    unoptimized: !isProd || process.env.NEXT_IMAGE_UNOPTIMIZED === "1",

    // Remote sources (keep in sync with any API allowlist)
    remotePatterns: buildRemotePatterns(),

    // Prefer modern formats (when optimizer is active)
    formats: ["image/avif", "image/webp"],

    // Allow SVGs but harden the image optimizer route with a strict CSP
    dangerouslyAllowSVG: true,
    contentSecurityPolicy:
      "default-src 'none'; img-src 'self' data: blob: https:; script-src 'none'; style-src 'unsafe-inline'; sandbox;",

    // Cloudinary/GCS/S3 versioned URLs tend to be immutable → safe to cache long
    minimumCacheTTL: 31536000, // 1 year
  },

  // Keep CI fast; fail TS only on production builds
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

    // 1) Force apex (non-www) — e.g. www.qwiksale.sale → qwiksale.sale
    if (APEX_DOMAIN) {
      rules.push({
        source: "/:path*",
        destination: `https://${APEX_DOMAIN}/:path*`,
        permanent: true,
        has: [{ type: "host", value: `www.${APEX_DOMAIN}` }],
      });
    }

    // 2) Force HTTPS on the apex host only (don't hijack preview/staging domains)
    if (APEX_DOMAIN) {
      rules.push({
        source: "/:path*",
        destination: `https://${APEX_DOMAIN}/:path*`,
        permanent: true,
        has: [
          { type: "host", value: APEX_DOMAIN }, // only apply on apex
          { type: "header", key: "x-forwarded-proto", value: "http" },
        ],
      });
    }

    return rules;
  },

  async rewrites() {
    const rules: { source: string; destination: string }[] = [];
    const tunnel = getSentryTunnelRewrite();
    if (tunnel) rules.push(tunnel);
    return rules;
  },

  experimental: {
    // Add any libs you import many components from to shrink bundle size
    optimizePackageImports: ["lodash", "date-fns", "lucide-react"],
  },
};

export default withSentryConfig(withAnalyzer(baseConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
});
