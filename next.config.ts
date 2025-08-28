// next.config.ts
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const IGNORE = process.env.IGNORE_BUILD_ERRORS === "1";
const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "";

/** Build security headers (CSP, etc.) */
const securityHeaders = (): { key: string; value: string }[] => {
  const connectParts = [
    "'self'",
    // Safaricom (Daraja)
    "https://sandbox.safaricom.co.ke",
    "https://api.safaricom.co.ke",
    // Google auth/APIs
    "https://accounts.google.com",
    "https://www.googleapis.com",
    // tunnels
    "https://*.ngrok-free.app",
    "https://*.ngrok.io",
  ];

  // Dev: allow websockets for HMR & tooling
  if (!isProd) {
    connectParts.push("ws:", "wss:");
  }

  const connect = connectParts.join(" ");

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

  const frameSrc = ["'self'", "https://accounts.google.com"].join(" ");

  const scriptParts = [
    "'self'",
    // Next/Auth sometimes injects inline bits; keep 'unsafe-inline'
    "'unsafe-inline'",
    "https://accounts.google.com",
  ];
  if (!isProd) scriptParts.push("'unsafe-eval'"); // dev-only

  const csp = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    `img-src ${img}`,
    `connect-src ${connect}`,
    `script-src ${scriptParts.join(" ")}`,
    `style-src 'self' 'unsafe-inline'`,
    `font-src 'self' data:`,
    `frame-src ${frameSrc}`,
    `form-action 'self' https://accounts.google.com`,
    isProd ? `upgrade-insecure-requests` : ``,
  ]
    .filter(Boolean)
    .join("; ");

  const headers: { key: string; value: string }[] = [
    { key: "Content-Security-Policy", value: csp },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-DNS-Prefetch-Control", value: "on" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    {
      key: "Permissions-Policy",
      value:
        "accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(self), publickey-credentials-get=(self), usb=()",
    },
  ];

  if (isProd) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }
  return headers;
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",

  // Temporary unblocks if needed: set IGNORE_BUILD_ERRORS=1 in env
  typescript: { ignoreBuildErrors: IGNORE },
  eslint: { ignoreDuringBuilds: IGNORE },

  experimental: {
    // Helps when Prisma is pulled into RSC/server contexts
    serverComponentsExternalPackages: ["@prisma/client"],
  },

  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders() }];
  },

  images: {
    remotePatterns: [
      // Cloudinary (scoped to your cloud if set)
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: cloudName ? `/${cloudName}/**` : "/**",
      },
      // Google avatars
      { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
      // Stock/demo images
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
      { protocol: "https", hostname: "plus.unsplash.com", pathname: "/**" },
      { protocol: "https", hostname: "images.pexels.com", pathname: "/**" },
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
    ],
  },
};

export default nextConfig;
