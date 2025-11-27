// next.config.ts
import type { NextConfig } from "next";
import type { RemotePattern } from "next/dist/shared/lib/image-config";
import path from "node:path";
import bundleAnalyzer from "@next/bundle-analyzer";

const withAnalyzer = bundleAnalyzer({
  enabled: process.env["ANALYZE"] === "true",
});

const isProd = process.env.NODE_ENV === "production";
const isPreview = process.env["VERCEL_ENV"] === "preview";
const isVercel = !!process.env["VERCEL"];

const APEX_DOMAIN = process.env["NEXT_PUBLIC_APEX_DOMAIN"] || "qwiksale.sale";
const cloudName = process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] || "";

const EXTRA_IMAGE_HOSTS = (process.env["NEXT_PUBLIC_IMAGE_HOSTS"] || "")
  .split(/[,\s]+/)
  .map((s) => s.trim())
  .filter(Boolean);

type HeaderRule = {
  source: string;
  headers: { key: string; value: string }[];
};

// ----------------------------
// SECURITY HEADERS
// ----------------------------
const securityHeaders = (): { key: string; value: string }[] => {
  const base = [
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "X-DNS-Prefetch-Control", value: "on" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: "X-Download-Options", value: "noopen" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    { key: "X-XSS-Protection", value: "0" },
  ];

  if (isProd) {
    return [
      ...base,
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
    ];
  }

  return base;
};

// ----------------------------
// UTILITIES
// ----------------------------

function regExpToGlob(re: RegExp): string | null {
  const s = String(re);
  if (/node_modules/.test(s)) return "**/node_modules/**";
  if (/\.git/.test(s)) return "**/.git/**";
  if (/\.next/.test(s)) return "**/.next/**";
  const src = (re as any).source;
  if (src && /^[\w.\-_/]+$/.test(src)) return `**/${src}/**`;
  return null;
}

function toRemotePattern(
  input: string,
  opts: { pathname?: string; protocols?: Array<"http" | "https"> } = {},
): RemotePattern[] {
  const pathname = opts.pathname || "/**";
  const protocols = opts.protocols || ["https"];

  try {
    if (input.startsWith("http://") || input.startsWith("https://")) {
      const u = new URL(input);
      return protocols.map((p) => ({
        protocol: p,
        hostname: u.hostname,
        pathname,
      }));
    }
  } catch {}

  return protocols.map((p) => ({
    protocol: p,
    hostname: input,
    pathname,
  }));
}

function buildRemotePatterns(): RemotePattern[] {
  const base: RemotePattern[] = [
    {
      protocol: "https",
      hostname: "res.cloudinary.com",
      pathname: cloudName ? `/${cloudName}/**` : "/**",
    },
    { protocol: "https", hostname: "api.cloudinary.com", pathname: "/**" },
    { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
    { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
    { protocol: "https", hostname: "plus.unsplash.com", pathname: "/**" },
    { protocol: "https", hostname: "images.pexels.com", pathname: "/**" },
    { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
    { protocol: "https", hostname: "avatars.githubusercontent.com", pathname: "/**" },
    { protocol: "https", hostname: APEX_DOMAIN, pathname: "/**" },
    { protocol: "https", hostname: `www.${APEX_DOMAIN}`, pathname: "/**" },
    { protocol: "https", hostname: "imagedelivery.net", pathname: "/**" },
    { protocol: "https", hostname: "storage.googleapis.com", pathname: "/**" },
    { protocol: "https", hostname: "s3.amazonaws.com", pathname: "/**" },
    { protocol: "https", hostname: "utfs.io", pathname: "/**" },
  ];

  const dev: RemotePattern[] = [
    ...toRemotePattern("localhost", { protocols: ["http", "https"] }),
    ...toRemotePattern("127.0.0.1", { protocols: ["http", "https"] }),
  ];

  const extra: RemotePattern[] = EXTRA_IMAGE_HOSTS.flatMap((h) =>
    toRemotePattern(h, {
      protocols: isProd ? ["https"] : ["http", "https"],
    }),
  );

  const seen = new Set<string>();
  const out: RemotePattern[] = [];

  for (const p of [...base, ...dev, ...extra]) {
    const key = `${p.protocol}://${p.hostname}${p.pathname}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }

  return out;
}

// ----------------------------
// NEXT CONFIG
// ----------------------------
const baseConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  trailingSlash: false,
  productionBrowserSourceMaps: false,

  images: {
    unoptimized: !isProd || process.env["NEXT_IMAGE_UNOPTIMIZED"] === "1",
    remotePatterns: buildRemotePatterns(),
    formats: ["image/avif", "image/webp"],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy:
      "default-src 'none'; img-src 'self' data: blob: https:; script-src 'none'; style-src 'unsafe-inline'; sandbox;",
    minimumCacheTTL: 31536000,
  },

  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: isPreview },

  webpack(config, { dev, isServer, nextRuntime }) {
    config.resolve = config.resolve || {};
    config.resolve.alias = { ...(config.resolve.alias || {}) };

    if (process.env["BLOCK_NEXT_DOCUMENT_IMPORT"] === "1") {
      config.resolve.alias["next/document"] = false;
    }

    const isEdge = nextRuntime === "edge";
    const isClient = !isServer;

    if (isEdge || isClient) {
      const alias: any = config.resolve.alias;
      alias["@sentry/node"] = path.resolve(__dirname, "src/shims/sentry-node");
      alias["import-in-the-middle"] = false;
      alias["require-in-the-middle"] = false;
      alias["diagnostics_channel"] = false;
      alias["module-details-from-path"] = false;
      alias["worker_threads"] = false;
      alias["node:child_process"] = false;
      alias["perf_hooks"] = false;
      alias["path"] = false;

      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        diagnostics_channel: false,
        "module-details-from-path": false,
        worker_threads: false,
        "node:child_process": false,
        perf_hooks: false,
        path: false,
      };
    }

    if (dev) {
      const extraIgnores = [
        "**/tests/**",
        "**/test-results/**",
        "**/playwright-report/**",
      ];

      const prevIgnored = config.watchOptions?.ignored;
      const prevList = Array.isArray(prevIgnored)
        ? prevIgnored
        : prevIgnored
        ? [prevIgnored]
        : [];

      const stringsOnly = prevList
        .map((v) => {
          if (typeof v === "string") return v;
          if (v instanceof RegExp) return regExpToGlob(v);
          return null;
        })
        .filter(Boolean) as string[];

      config.watchOptions = {
        ...(config.watchOptions || {}),
        ignored: Array.from(new Set([...stringsOnly, ...extraIgnores])),
      };
    }

    return config;
  },

  async headers() {
    const rules: HeaderRule[] = [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders(),
          {
            key: "Content-Security-Policy",
            value: `
              default-src 'self';
              img-src 'self' data: blob:
                https://res.cloudinary.com
                https://images.unsplash.com
                https://plus.unsplash.com
                https://lh3.googleusercontent.com
                https://avatars.githubusercontent.com
                https://images.pexels.com
                https://picsum.photos;
              media-src 'self' blob: https:;
              style-src 'self' 'unsafe-inline';
              script-src 'self' 'unsafe-inline' 'unsafe-eval';
              frame-src 'self';
              object-src 'none';
              connect-src 'self'
                https://api.cloudinary.com
                https://res.cloudinary.com
                https://api.resend.com
                https://api.africastalking.com
                https://api.sandbox.africastalking.com
                https://vitals.vercel-insights.com
                https://vitals.vercel-analytics.com
                https://plausible.io
                https://www.google-analytics.com
                https://region1.google-analytics.com
                ws: wss:;
            `.replace(/\s+/g, " "),
          },
        ],
      },
      {
        source: "/api/auth/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
    ];

    return rules;
  },

  async redirects() {
    if (!(isProd && isVercel) || !APEX_DOMAIN) return [];

    return [
      {
        source: "/:path*",
        destination: `https://${APEX_DOMAIN}/:path*`,
        permanent: true,
        has: [{ type: "host", value: `www.${APEX_DOMAIN}` }],
      },
      {
        source: "/:path*",
        destination: `https://${APEX_DOMAIN}/:path*`,
        permanent: true,
        has: [
          { type: "host", value: APEX_DOMAIN },
          { type: "header", key: "x-forwarded-proto", value: "http" },
        ],
      },
    ];
  },

  async rewrites() {
    return [];
  },

  experimental: {
    optimizePackageImports: ["lodash", "date-fns", "lucide-react"],
  },
};

export default withAnalyzer(baseConfig);
