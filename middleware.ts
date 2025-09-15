import { withAuth } from "next-auth/middleware";
import { NextResponse, type NextRequest } from "next/server";

/* ------------------- Edge-safe helpers (no Node Buffer) ------------------- */
function makeNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function makeUUID() {
  return (crypto as any)?.randomUUID?.() ?? `${Date.now().toString(36)}-${makeNonce()}`;
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
  if (process.env.NODE_ENV === "production") {
    headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return headers;
}

/* ------------------------- tiny guards for JSON POSTs ------------------------- */
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

/* --------------------- Unified middleware (auth + CSP + cookie) -------------------- */
export default withAuth(
  function middleware(req: NextRequest) {
    const p = req.nextUrl.pathname;

    // ✅ Never run middleware on NextAuth routes (prevents breaking Set-Cookie)
    if (p.startsWith("/api/auth")) {
      return NextResponse.next();
    }

    const isDev =
      process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";
    const nonce = makeNonce();

    // JSON guards for sensitive POST endpoints
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

    // Security headers (not applied to /api/auth because we exit above)
    const sec = buildSecurityHeaders(nonce, isDev);
    for (const [k, v] of sec.entries()) res.headers.set(k, v);

    // Device cookie
    if (!req.cookies.get("qs_did")?.value) {
      res.cookies.set({
        name: "qs_did",
        value: makeUUID(),
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

        // belt-and-suspenders: always allow auth infra
        if (p.startsWith("/api/auth")) return true;

        const needsAuth = p.startsWith("/sell");
        const needsAdmin = p.startsWith("/admin") || p.startsWith("/api/admin");

        if (needsAdmin) return !!token && (token as any).role === "admin";
        if (needsAuth) return !!token;
        return true;
      },
    },
  }
);

/* ----------------------------- Route matcher ------------------------------ */
export const config = {
  matcher: [
    // Exclude NextAuth + static assets + sitemap endpoints
    '/((?!api/auth|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|sitemaps).*)',
  ],
};
