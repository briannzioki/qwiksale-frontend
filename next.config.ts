// next.config.ts (project root)
import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

const isProd = process.env.NODE_ENV === "production";
const isPreview = process.env.VERCEL_ENV === "preview";

const APEX_DOMAIN = process.env.NEXT_PUBLIC_APEX_DOMAIN || "qwiksale.sale";
const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "";
const EXTRA_IMAGE_HOSTS = (process.env.NEXT_PUBLIC_IMAGE_HOSTS || "")
  .split(/[,\s]+/)
  .map((s) => s.trim())
  .filter(Boolean);

// local helper to keep types simple
type HeaderRule = { source: string; headers: { key: string; value: string }[] };

const securityHeaders = (): { key: string; value: string }[] => {
  const base = [
    // CSP is handled in middleware.ts via nonce + strict-dynamic
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
  } catch {}
  return protocols.map((p) => ({ protocol: p, hostname: input, pathname })) as Array<{
    protocol: "http" | "https";
    hostname: string;
    pathname: string;
  }>;
}

function buildRemotePatterns() {
  const base: Array<{ protocol: "http" | "https"; hostname: string; pathname: string }> = [
    // Cloudinary (scope to cloudName if provided)
    { protocol: "https", hostname: "res.cloudinary.com", pathname: cloudName ? `/${cloudName}/**` : "/**" },

    // Common avatar/stock sources
    { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
    { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
    { protocol: "https", hostname: "images.pexels.com", pathname: "/**" },
    { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
    { protocol: "https", hostname: "avatars.githubusercontent.com", pathname: "/**" },

    // First-party
    { protocol: "https", hostname: APEX_DOMAIN, pathname: "/**" },
    { protocol: "https", hostname: `www.${APEX_DOMAIN}`, pathname: "/**" },

    // CDNs/object stores we may use
    { protocol: "https", hostname: "imagedelivery.net", pathname: "/**" },
    { protocol: "https", hostname: "s3.amazonaws.com", pathname: "/**" },
    { protocol: "https", hostname: "storage.googleapis.com", pathname: "/**" },
    { protocol: "https", hostname: "utfs.io", pathname: "/**" },
  ];

  const dev = [
    ...toRemotePattern("localhost", { protocols: ["http", "https"] }),
    ...toRemotePattern("127.0.0.1", { protocols: ["http", "https"] }),
  ];

  const extra = EXTRA_IMAGE_HOSTS.flatMap((h) =>
    toRemotePattern(h, { protocols: isProd ? ["https"] : ["http", "https"] })
  );

  const seen = new Set<string>();
  return [...base, ...dev, ...extra].filter((p) => {
    const key = `${p.protocol}://${p.hostname}${p.pathname}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const baseConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // Do NOT emit browser source maps anymore (we're not uploading them)
  productionBrowserSourceMaps: false,

  images: {
    unoptimized: !isProd || process.env.NEXT_IMAGE_UNOPTIMIZED === "1",
    remotePatterns: buildRemotePatterns(),
    formats: ["image/avif", "image/webp"],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy:
      "default-src 'none'; img-src 'self' data: blob: https:; script-src 'none'; style-src 'unsafe-inline'; sandbox;",
    minimumCacheTTL: 31536000,
  },

  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: isPreview },

  async headers() {
    const rules: HeaderRule[] = [
      { source: "/:path*", headers: securityHeaders() },
      {
        source: "/api/auth/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
    ];
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

    // www → apex
    if (APEX_DOMAIN) {
      rules.push({
        source: "/:path*",
        destination: `https://${APEX_DOMAIN}/:path*`,
        permanent: true,
        has: [{ type: "host", value: `www.${APEX_DOMAIN}` }],
      });
    }

    // Force HTTPS only on apex host
    if (APEX_DOMAIN) {
      rules.push({
        source: "/:path*",
        destination: `https://${APEX_DOMAIN}/:path*`,
        permanent: true,
        has: [
          { type: "host", value: APEX_DOMAIN },
          { type: "header", key: "x-forwarded-proto", value: "http" },
        ],
      });
    }

    return rules;
  },

  async rewrites() {
    // No need for a legacy tunnel rewrite; we’re using /api/monitoring
    return [];
  },

  experimental: {
    optimizePackageImports: ["lodash", "date-fns", "lucide-react"],
  },
};

// IMPORTANT: No Sentry wrapper here.
const finalConfig = withAnalyzer(baseConfig);
export default finalConfig;
