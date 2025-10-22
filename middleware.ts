// src/middleware.ts
import { withAuth } from "next-auth/middleware";
import { NextResponse, type NextRequest } from "next/server";

/* ------------------- Edge-safe helpers ------------------- */
function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function makeUUID(): string {
  return (crypto as any)?.randomUUID?.() ?? `${Date.now().toString(36)}-${makeNonce()}`;
}

/* ---------------------- Debug breadcrumbs ---------------------- */
const DEBUG = process.env.DEBUG_REDIRECTS === "1";
const dbg = (...a: any[]) => { if (DEBUG) console.log("[mw]", ...a); };

/* ---------- Better detection of HTML navigations ---------- */
function isDocumentNav(req: NextRequest): boolean {
  const accept = (req.headers.get("accept") || "").toLowerCase();
  const dest = (req.headers.get("sec-fetch-dest") || "").toLowerCase();
  return dest === "document" || accept.includes("text/html");
}

/* ----------------------- Suggest soft limiter ---------------------- */
const SUGGEST_WINDOW_MS = Number(process.env.SUGGEST_WINDOW_MS ?? 10_000);
const SUGGEST_LIMIT = Number(process.env.SUGGEST_LIMIT ?? 12);

type StampStore = Map<string, number[]>;
const g = globalThis as unknown as { __QS_SUGGEST_RL__?: StampStore };
const SUGGEST_STORE: StampStore = g.__QS_SUGGEST_RL__ ?? new Map();
if (!g.__QS_SUGGEST_RL__) g.__QS_SUGGEST_RL__ = SUGGEST_STORE;

function isSuggestApiPath(p: string) {
  return p.startsWith("/api/") && /(?:^|\/)suggest(?:\/|$)/i.test(p);
}
function rlKeyFromReq(req: NextRequest) {
  const ip =
    (req as any).ip ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "0.0.0.0";
  const ua = req.headers.get("user-agent") || "ua";
  return `${ip}::${ua}`;
}

/* ------------------------- Security / CSP ------------------------- */
function buildSecurityHeaders(nonce: string, isDev: boolean, reportOnly: boolean) {
  const imgSrc = [
    "'self'",
    "data:",
    "blob:",
    "https://res.cloudinary.com",
    "https://images.unsplash.com",
    "https://plus.unsplash.com",
    "https://lh3.googleusercontent.com",
    "https://avatars.githubusercontent.com",
    "https://images.pexels.com",
    "https://picsum.photos",
    "https://www.google-analytics.com",
  ].join(" ");

  const connectSrc = [
    "'self'",
    "https://api.resend.com",
    "https://api.africastalking.com",
    "https://api.sandbox.africastalking.com",
    "https://vitals.vercel-insights.com",
    "https://vitals.vercel-analytics.com",
    "https://plausible.io",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
    "https://accounts.google.com",
    "https://www.googleapis.com",
    "ws:",
    "wss:",
  ].join(" ");

  const styleSrc = ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"].join(" ");
  const fontSrc = ["'self'", "data:", "https://fonts.gstatic.com"].join(" ");

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDev ? ["'unsafe-eval'"] : []),
    "https://plausible.io",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
  ].join(" ");

  const frameSrc = ["'self'", "https://accounts.google.com"].join(" ");
  const formAction = ["'self'", "https://accounts.google.com"].join(" ");

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
      `frame-src ${frameSrc}`,
      `form-action ${formAction}`,
    ].join("; ") + ";";

  const headers = new Headers();
  headers.set(reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", csp);
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
  if (!["POST", "PUT", "PATCH"].includes(req.method)) return null;
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    return new NextResponse(JSON.stringify({ error: "Bad request" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  return null;
}

/* -------------------- Optional Origin allow-list -------------------- */
function isAllowedOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  try {
    const o = new URL(origin);
    if (o.host === req.nextUrl.host) return true;
  } catch {
    return false;
  }

  const raw = process.env.CORS_ALLOW_ORIGINS || process.env.NEXT_PUBLIC_APP_URL || "";
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);

  return list.some((entry) => {
    try {
      return new URL(entry).origin === new URL(origin).origin;
    } catch {
      return false;
    }
  });
}

/* -------------------- Admin detection helper -------------------- */
function splitSet(v?: string | null) {
  return (v ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminFromToken(req: NextRequest): boolean {
  const t: any = (req as any).nextauth?.token ?? null;
  const role = typeof t?.role === "string" ? t.role.toUpperCase() : "";

  const tokenIsSuper = t?.isSuperAdmin === true || role === "SUPERADMIN";
  const tokenIsAdmin = t?.isAdmin === true || role === "ADMIN" || tokenIsSuper;

  const email = (t?.email as string | undefined)?.toLowerCase() ?? "";
  const adminList = new Set(splitSet(process.env.ADMIN_EMAILS));
  const superList = new Set(splitSet(process.env.SUPERADMIN_EMAILS));

  const emailIsSuper = !!email && superList.has(email);
  const emailIsAdmin = !!email && (adminList.has(email) || emailIsSuper);

  return tokenIsAdmin || emailIsAdmin;
}

/* -------------------- URL normalize helpers -------------------- */
function normalize(href: URL | string): string {
  const u = href instanceof URL ? href : new URL(String(href), "http://_");
  let pathname = u.pathname || "/";
  if (pathname !== "/") pathname = pathname.replace(/\/+$/, "");
  const entries = Array.from(u.searchParams.entries()).filter(([, v]) => v !== "");
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const qs = new URLSearchParams(entries).toString();
  return `${pathname}${qs ? `?${qs}` : ""}`;
}

/* -------------------- Loop-proof redirect helper -------------------- */
function safeRedirectResponse(req: NextRequest, to: string | URL) {
  const fromNorm = normalize(req.nextUrl);
  const destUrl = to instanceof URL ? to : new URL(String(to), req.nextUrl);
  const toNorm = normalize(destUrl);

  if (fromNorm === toNorm) return NextResponse.next();
  if (toNorm === "/" && fromNorm === "/") return NextResponse.next();

  const sentinel = req.cookies.get("_qs_rl")?.value || "";
  theLoop: {
    const [lastTo = "", lastTs = "0"] = sentinel.split("|");
    const lastAt = Number(lastTs) || 0;
    const now = Date.now();
    if (lastTo === toNorm && now - lastAt < 2000) return NextResponse.next();
  }

  const absolute = new URL(toNorm, req.nextUrl);
  if (absolute.href === req.nextUrl.href) return NextResponse.next();

  const res = NextResponse.redirect(absolute);
  res.cookies.set({
    name: "_qs_rl",
    value: `${toNorm}|${Date.now()}`,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60,
  });
  return res;
}
function redirectIfDifferent(req: NextRequest, to: string | URL) {
  return safeRedirectResponse(req, to);
}

/* ------------------------ Optional canonical domain ------------------------ */
function maybeCanonicalDomain(req: NextRequest): NextResponse | null {
  const enforce = process.env.PRIMARY_DOMAIN_ENFORCE === "1";
  if (!enforce) return null;
  if (process.env.NODE_ENV !== "production") return null;

  const host = (req.headers.get("host") || "").toLowerCase();
  const isLocal = host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
  if (isLocal) return null;

  const primary = (process.env.PRIMARY_DOMAIN || "").trim().toLowerCase();
  if (!primary) return null;

  const currentHost = host.startsWith("www.") ? host.slice(4) : host;
  const desiredHost = primary;

  const to = new URL(req.nextUrl);
  let changed = false;

  if (currentHost !== desiredHost) { to.host = desiredHost; changed = true; }
  if (to.protocol !== "https:") { to.protocol = "https:"; changed = true; }

  if (!changed) return null;
  if (to.href === req.nextUrl.href) return null;

  dbg("CANONICAL 301:", req.nextUrl.href, "→", to.href);
  return NextResponse.redirect(to, 301);
}

/* ------------------------ Path helpers ------------------------ */
const PUBLIC_PATHS = new Set<string>(["/", "/signin", "/signup", "/help"]);
function isAuthPath(p: string) {
  return p === "/signin" || p === "/signup";
}
function isProtectedPath(p: string) {
  // Intentionally DO NOT include "/dashboard" so it can render a soft prompt.
  return (
    p.startsWith("/sell") ||
    p.startsWith("/account") ||
    p.startsWith("/messages") ||
    p.startsWith("/saved") ||
    p.startsWith("/settings")
  );
}
function hasSessionCookie(req: NextRequest): boolean {
  return Boolean(
    req.cookies.get("__Secure-next-auth.session-token")?.value ||
      req.cookies.get("next-auth.session-token")?.value
  );
}

/* -------------------------------- middleware -------------------------------- */

export default withAuth(
  function middleware(req: NextRequest) {
    const p = req.nextUrl.pathname;

    // Preflight / monitoring
    if (req.method === "OPTIONS" || p === "/api/monitoring") return NextResponse.next();

    // Skip infra/static/auth/health
    if (
      p.startsWith("/api/auth") ||
      p.startsWith("/api/health") ||
      p.startsWith("/_next") ||
      p.startsWith("/_vercel") ||
      p === "/favicon.ico" ||
      p === "/robots.txt" ||
      p === "/sitemap.xml" ||
      p.startsWith("/sitemaps") ||
      p.startsWith("/.well-known")
    ) {
      return NextResponse.next();
    }

    const isApi = p.startsWith("/api/");
    const doc = !isApi && isDocumentNav(req);

    // Canonical domain (opt-in)
    if (!isApi) {
      const canon = maybeCanonicalDomain(req);
      if (canon) return canon;
    }

    const isPreview = process.env.VERCEL_ENV === "preview" || process.env.NEXT_PUBLIC_NOINDEX === "1";
    const isDev = process.env.NODE_ENV !== "production" || isPreview;
    const useReportOnly = isPreview || process.env.CSP_REPORT_ONLY === "1";

    // JSON guard (selected mutating endpoints)
    if (
      (p === "/api/billing/upgrade" && req.method === "POST") ||
      (p.startsWith("/api/products/") && p.endsWith("/promote") && req.method === "POST")
    ) {
      const bad = mustBeJson(req);
      if (bad) return bad;
    }

    // Origin allow-list for mutating methods (API only)
    if (isApi && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      if (!isAllowedOrigin(req)) {
        return new NextResponse(JSON.stringify({ error: "Origin not allowed" }), {
          status: 403,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }
    }

    // Soft RL for suggest endpoints
    if (isApi && isSuggestApiPath(p)) {
      const key = rlKeyFromReq(req);
      const now = Date.now();
      const cutoff = now - SUGGEST_WINDOW_MS;

      const arr = SUGGEST_STORE.get(key) ?? [];
      while (arr.length && arr[0] <= cutoff) arr.shift();

      if (arr.length >= SUGGEST_LIMIT) {
        const oldest = arr[0] ?? now;
        const retryMs = Math.max(2000, SUGGEST_WINDOW_MS - (now - oldest));
        const retrySec = Math.max(1, Math.ceil(retryMs / 1000));

        return new NextResponse(JSON.stringify({ error: "Too many requests. Please slow down." }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Retry-After": String(retrySec),
            "X-RateLimit-Limit": String(SUGGEST_LIMIT),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Policy": `${SUGGEST_LIMIT};w=${Math.round(SUGGEST_WINDOW_MS / 1000)}`,
            "X-RateLimit-Bucket": "suggest",
          },
        });
      }

      arr.push(now);
      SUGGEST_STORE.set(key, arr);
    }

    const loggedIn = hasSessionCookie(req);

    /* ----------------------- Admin UI gate (/admin) ----------------------- */
    if (!isApi && p.startsWith("/admin")) {
      const admin = isAdminFromToken(req);

      if (!loggedIn) {
        const signin = new URL("/signin", req.url);
        signin.searchParams.set("callbackUrl", normalize(req.nextUrl));
        return redirectIfDifferent(req, signin);
      }

      if (!admin) {
        return redirectIfDifferent(req, "/");
      }
    }
    /* --------------------------------------------------------------------- */

    /* ------------------------ Sign-in page handling ----------------------- */
    if (!isApi && isAuthPath(p)) {
      if (loggedIn) {
        const cb = req.nextUrl.searchParams.get("callbackUrl");
        const target = cb && cb.trim() ? cb : "/dashboard";
        return redirectIfDifferent(req, target);
      }
      return NextResponse.next();
    }
    /* --------------------------------------------------------------------- */

    /* ------------- Gate protected (non-dashboard) app areas -------------- */
    if (!isApi && !loggedIn && isProtectedPath(p)) {
      const signin = new URL("/signin", req.url);
      signin.searchParams.set("callbackUrl", normalize(req.nextUrl) || "/");
      return redirectIfDifferent(req, signin);
    }
    /* --------------------------------------------------------------------- */

    /* -------------------- Role-aware home routing -------------------- */
    if (!isApi) {
      const admin = isAdminFromToken(req);
      const wantsSkip = req.nextUrl.searchParams.get("skipAdmin") === "1";

      // Admins: / or /dashboard -> /admin (unless ?skipAdmin=1)
      if (loggedIn && admin && !wantsSkip && (p === "/" || p === "/dashboard") && !p.startsWith("/admin")) {
        return redirectIfDifferent(req, "/admin");
      }

      // ✅ Restore this to avoid any “Sign in” flicker on home while authed:
      if (loggedIn && !admin && p === "/") {
        return redirectIfDifferent(req, "/dashboard");
      }
    }
    /* ---------------------------------------------------------------- */

    // Propagate CSP nonce only for HTML docs
    const nonce = doc ? makeNonce() : "";
    const forwarded = new Headers(req.headers);
    if (nonce) forwarded.set("x-nonce", nonce);

    const res = NextResponse.next({ request: { headers: forwarded } });

    // Security headers for documents only
    if (!isApi && doc) {
      const sec = buildSecurityHeaders(nonce, isDev, useReportOnly);
      for (const [k, v] of sec.entries()) res.headers.set(k, v);
    }

    // Device cookie (host-only) on HTML docs
    if (!isApi && doc && !req.cookies.get("qs_did")?.value) {
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
      /**
       * Let our code above control redirects; withAuth should not auto-redirect UI routes.
       * Keep /api/admin strict here (401 for API if not admin).
       */
      authorized: ({ req, token }) => {
        const p = req.nextUrl.pathname;

        if (p.startsWith("/api/admin")) {
          const t: any = token ?? {};
          const role = typeof t.role === "string" ? t.role.toUpperCase() : "";
          const tokenIsSuper = t.isSuperAdmin === true || role === "SUPERADMIN";
          const tokenIsAdmin = t.isAdmin === true || role === "ADMIN" || tokenIsSuper;

          const email = typeof t.email === "string" ? t.email.toLowerCase() : "";
          const adminList = splitSet(process.env.ADMIN_EMAILS);
          const superList = splitSet(process.env.SUPERADMIN_EMAILS);
          const emailIsAdmin = !!email && (adminList.includes(email) || superList.includes(email));

          return !!token && (tokenIsAdmin || emailIsAdmin);
        }

        return true;
      },
    },
  }
);

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|sitemaps|api/auth|api/health|api/monitoring|_vercel|\\.well-known).*)",
  ],
};
