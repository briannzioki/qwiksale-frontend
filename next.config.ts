// next.config.ts
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "";

const securityHeaders = (): { key: string; value: string }[] => {
  const connect = [
    "'self'",
    "https://sandbox.safaricom.co.ke",
    "https://api.safaricom.co.ke",
    "https://accounts.google.com",
    "https://www.googleapis.com",
    "https://*.ngrok-free.app",
    "https://*.ngrok.io",
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

  const frameSrc = ["'self'", "https://accounts.google.com"].join(" ");

  const script = [
    "'self'",
    "'unsafe-inline'",
    "https://accounts.google.com",
    ...(isProd ? [] : ["'unsafe-eval'"]),
  ].join(" ");

  const csp = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    `img-src ${img}`,
    `connect-src ${connect}`,
    `script-src ${script}`,
    `style-src 'self' 'unsafe-inline'`,
    `font-src 'self' data:`,
    `frame-src ${frameSrc}`,
    `form-action 'self' https://accounts.google.com`,
    isProd ? `upgrade-insecure-requests` : ``,
  ]
    .filter(Boolean)
    .join("; ");

  const headers = [
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

  return headers as { key: string; value: string }[];
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  serverExternalPackages: ["@prisma/client"],
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders() }];
  },
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
  },
};

export default nextConfig;
