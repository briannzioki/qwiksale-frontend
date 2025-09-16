// middleware.ts
import { withAuth } from "next-auth/middleware";
import { NextResponse, type NextRequest } from "next/server";

/* ------------------- Edge-safe helpers ------------------- */
function makeNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function makeUUID() {
  // Random device id for host-only cookie
  return (crypto as any)?.randomUUID?.() ?? `${Date.now().toString(36)}-${makeNonce()}`;
}

/* ------------------------- Security / CSP ------------------------- */
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
  if (process.env.NODE_ENV === "production") {
    headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return headers;
}

/* -------------------- JSON body guard (select POSTs) -------------------- */
function mustBeJson(req: NextRequest) {
  if (req.method !== "POST") return null;
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    return new NextResponse(JSON.stringify({ error: "Bad request" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  return null;
}

/* --------------------- Main middleware body --------------------- */
export default withAuth(
  function middleware(req: NextRequest) {
    const p = req.nextUrl.pathname;

    // Hard opt-out: never touch NextAuth or common infra/static
    if (
      p.startsWith("/api/auth") || // NextAuth callbacks/providers/csrf/etc
      p.startsWith("/_next") ||    // Next.js internals (incl. static/css/js)
      p.startsWith("/_vercel") ||
      p === "/favicon.ico" ||
      p.startsWith("/icon") ||
      p === "/robots.txt" ||
      p === "/sitemap.xml" ||
      p.startsWith("/sitemaps") ||
      p.startsWith("/.well-known") ||
      p.startsWith("/api/health")
    ) {
      return NextResponse.next();
    }

    const isDev =
      process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";
    const nonce = makeNonce();

    // JSON guard on specific endpoints only (never on /api/auth/**)
    if (
      (p === "/api/billing/upgrade" && req.method === "POST") ||
      (p.startsWith("/api/products/") && p.endsWith("/promote") && req.method === "POST")
    ) {
      const bad = mustBeJson(req);
      if (bad) return bad;
    }

    // Forward nonce to app
    const forwarded = new Headers(req.headers);
    forwarded.set("x-nonce", nonce);
    const res = NextResponse.next({ request: { headers: forwarded } });

    // Security headers
    const sec = buildSecurityHeaders(nonce, isDev);
    for (const [k, v] of sec.entries()) res.headers.set(k, v);

    // Device cookie (host-only; does NOT replace NextAuth cookies)
    if (!req.cookies.get("qs_did")?.value) {
      const did = makeUUID();
      res.cookies.set({
        name: "qs_did",
        value: did,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return res;
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        const p = req.nextUrl.pathname;

        // Gate only what truly needs auth
        const needsAuth =
          p.startsWith("/sell") ||
          p.startsWith("/account") ||
          p.startsWith("/dashboard") ||
          p.startsWith("/messages") ||
          p.startsWith("/saved"); // if your Saved page is only for signed-in users

        const needsAdmin = p.startsWith("/admin") || p.startsWith("/api/admin");

        if (needsAdmin) return !!token && (token as any).role === "admin";
        if (needsAuth) return !!token;
        return true;
      },
    },
  }
);

/* ----------------------------- Matcher ----------------------------- */
/** Exclude NextAuth & static at the matcher level too (belt & suspenders) */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|sitemaps|api/auth|_vercel|\\.well-known).*)",
  ],
};
