// src/middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Edge-safe nonce generator (Web Crypto)
function makeNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // Buffer is available in Edge runtime for base64; if not, use btoa on string
  return Buffer.from(bytes).toString("base64");
}

export function middleware(req: NextRequest) {
  const nonce = makeNonce();
  const isDev =
    process.env.NODE_ENV !== "production" ||
    process.env.VERCEL_ENV === "preview";

  // --- Allow external resources you actually use ---
  const imgSrc = [
    "'self'",
    "data:",
    "blob:",
    "https://res.cloudinary.com",
    "https://images.unsplash.com",
    // GA beacons
    "https://www.google-analytics.com",
  ].join(" ");

  const connectSrc = [
    "'self'",
    "https://api.resend.com",
    "https://api.africastalking.com",
    "https://api.sandbox.africastalking.com",
    "https://vitals.vercel-insights.com",
    "ws:",
    "wss:",
    // Analytics
    "https://plausible.io",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
  ].join(" ");

  const styleSrc = [
    "'self'",
    "'unsafe-inline'", // if you later remove inline styles, you can drop this
    "https://fonts.googleapis.com",
  ].join(" ");

  const fontSrc = ["'self'", "data:", "https://fonts.gstatic.com"].join(" ");

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`, // allow our inline scripts with nonce
    ...(isDev ? ["'unsafe-eval'"] : []), // dev only (React Refresh)
    // Analytics
    "https://plausible.io",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
  ].join(" ");

  const csp = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'self'`,
    `img-src ${imgSrc}`,
    `style-src ${styleSrc}`,
    `font-src ${fontSrc}`,
    `connect-src ${connectSrc}`,
    `script-src ${scriptSrc}`,
  ].join("; ");

  // Forward the nonce to the app through a header
  const res = NextResponse.next({
    request: {
      headers: new Headers({
        ...Object.fromEntries(req.headers),
        "x-nonce": nonce,
      }),
    },
  });

  // Security headers
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  if (!isDev) {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|sitemaps).*)",
  ],
};
