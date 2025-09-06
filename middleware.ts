// middleware.ts
import { withAuth } from "next-auth/middleware";
import { NextResponse, type NextRequest } from "next/server";

/* ------------------- Edge-safe helpers (no Node Buffer) ------------------- */
function makeNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // base64 without Buffer
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // btoa is available in Edge runtime
  return btoa(binary);
}

/* ---------------------------- Security / CSP ------------------------------ */
function buildSecurityHeaders(nonce: string, isDev: boolean) {
  const imgSrc = [
    "'self'",
    "data:",
    "blob:",
    "https://res.cloudinary.com",
    "https://images.unsplash.com",
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
    "https://plausible.io",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
  ].join(" ");

  const styleSrc = ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"].join(" ");
  const fontSrc = ["'self'", "data:", "https://fonts.gstatic.com"].join(" ");

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    ...(isDev ? ["'unsafe-eval'"] : []),
    "https://plausible.io",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
  ].join(" ");

  const csp =
    [
      `default-src 'self'`,
      `base-uri 'self'`,
      `object-src 'none'`,
      `frame-ancestors 'self'`,
      `img-src ${imgSrc}`,
      `style-src ${styleSrc}`,
      `font-src ${fontSrc}`,
      `connect-src ${connectSrc}`,
      `script-src ${scriptSrc}`,
    ].join("; ") + ";";

  const headers = new Headers();
  headers.set("Content-Security-Policy", csp);
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  if (!isDev) {
    headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return headers;
}

/* --------------------- Unified middleware (auth + CSP) -------------------- */
export default withAuth(
  function middleware(req: NextRequest) {
    const isDev =
      process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";
    const nonce = makeNonce();

    // Forward nonce to the app for <Script nonce={...}/> usage
    const forwarded = new Headers(req.headers);
    forwarded.set("x-nonce", nonce);

    // Continue the request with forwarded headers
    const res = NextResponse.next({ request: { headers: forwarded } });

    // Apply security headers
    const sec = buildSecurityHeaders(nonce, isDev);
    for (const [k, v] of sec.entries()) res.headers.set(k, v);

    return res;
  },
  {
    // 🔐 Only require auth for /sell/** and /account/**
    callbacks: {
      authorized: ({ req, token }) => {
        const p = req.nextUrl.pathname;
        const needsAuth = p.startsWith("/sell") || p.startsWith("/account");
        return needsAuth ? !!token : true;
      },
    },
  }
);

/* ----------------------------- Route matcher ------------------------------ */
/**
 * We run on (almost) all routes to attach CSP, but skip Next static assets,
 * images, and known public files. Auth is still limited by the callback above.
 */
export const config = {
  matcher: [
    // everything except these:
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|sitemaps).*)",
  ],
};
