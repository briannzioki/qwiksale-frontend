import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";

type NextAuthAuthedRequest = NextRequest & { auth?: any };

function envStr(name: string): string | undefined {
  const v = process.env[name];
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function siteUrlFromEnv(): string | undefined {
  return (
    envStr("NEXTAUTH_URL") ??
    envStr("NEXT_PUBLIC_SITE_URL") ??
    envStr("NEXT_PUBLIC_APP_URL") ??
    envStr("NEXT_PUBLIC_BASE_URL")
  );
}

function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h.endsWith(".localhost");
}

/**
 * "Prod site" = real deployed production (not just NODE_ENV=production).
 * This prevents local `next start` on http://localhost from behaving like deployed prod.
 */
function isProdSite(): boolean {
  if (process.env["VERCEL_ENV"] != null) {
    return process.env["VERCEL_ENV"] === "production";
  }

  if (process.env.NODE_ENV !== "production") return false;

  const url = siteUrlFromEnv();
  if (!url) return false;

  try {
    const host = new URL(url).hostname;
    return !isLocalHost(host);
  } catch {
    return true;
  }
}

const IS_PROD_SITE = isProdSite();

function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function makeUUID(): string {
  const rnd = (crypto as any)?.randomUUID;
  return typeof rnd === "function" ? rnd.call(crypto) : `${Date.now().toString(36)}-${makeNonce()}`;
}

function isDocumentNav(req: NextRequest): boolean {
  const accept = (req.headers.get("accept") || "").toLowerCase();
  const dest = (req.headers.get("sec-fetch-dest") || "").toLowerCase();
  return dest === "document" || accept.includes("text/html");
}

function isHttpsRequest(req: NextRequest): boolean {
  const xf = req.headers.get("x-forwarded-proto");
  if (xf) {
    const p = xf.split(",")[0]?.trim().toLowerCase();
    if (p) return p === "https";
  }
  return req.nextUrl.protocol === "https:";
}

const SUGGEST_WINDOW_MS = Number(process.env["SUGGEST_WINDOW_MS"] ?? 10_000);
const SUGGEST_LIMIT = Number(process.env["SUGGEST_LIMIT"] ?? 12);

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

function isMpesaCallbackPath(p: string) {
  return p === "/api/pay/mpesa/callback" || p === "/api/mpesa/callback";
}

function buildSecurityHeaders(nonce: string, opts?: { allowUnsafeEval?: boolean; isHttps?: boolean }) {
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
    "https://api.cloudinary.com",
    "https://res.cloudinary.com",
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

  const scriptSrcParts = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "https://plausible.io",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
  ];

  if (opts?.allowUnsafeEval) scriptSrcParts.push("'unsafe-eval'");

  const scriptSrc = scriptSrcParts.join(" ");

  const frameSrc = ["'self'", "https://accounts.google.com"].join(" ");
  const formAction = ["'self'", "https://accounts.google.com"].join(" ");
  const workerSrc = ["'self'", "blob:"].join(" ");

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
      `worker-src ${workerSrc}`,
    ].join("; ") + ";";

  const headers = new Headers();
  headers.set("Content-Security-Policy", csp);
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

  if (IS_PROD_SITE && opts?.isHttps) {
    headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  return headers;
}

function isAllowedOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  try {
    const o = new URL(origin);
    if (o.host === req.nextUrl.host) return true;
  } catch {
    return false;
  }

  const raw = process.env["CORS_ALLOW_ORIGINS"] || process.env["NEXT_PUBLIC_APP_URL"] || "";
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return list.some((entry) => {
    try {
      return new URL(entry).origin === new URL(origin).origin;
    } catch {
      return false;
    }
  });
}

function normalize(href: URL | string): string {
  const u = href instanceof URL ? href : new URL(String(href), "http://localhost");
  let pathname = u.pathname || "/";
  if (pathname !== "/") pathname = pathname.replace(/\/+$/, "");
  const entries = Array.from(u.searchParams.entries()).filter(([, v]) => v !== "");
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const qs = new URLSearchParams(entries).toString();
  return `${pathname}${qs ? `?${qs}` : ""}`;
}

function isSafeInternalPath(p: string): boolean {
  const v = String(p || "").trim();
  return !!v && /^\/(?!\/)/.test(v);
}

function sanitizeSigninCallbackValue(raw: string, fallback: string): string {
  const v = String(raw || "").trim();
  if (!v) return fallback;
  if (!isSafeInternalPath(v)) return fallback;

  const lower = v.toLowerCase();
  if (lower === "/signin" || lower.startsWith("/signin?")) return fallback;
  if (lower === "/signup" || lower.startsWith("/signup?")) return fallback;
  if (lower.startsWith("/api/auth")) return fallback;

  return v;
}

function isAuthPath(p: string) {
  return p === "/signin" || p === "/signup";
}

function isProtectedPath(p: string) {
  if (p === "/sell/product") return false;
  return p.startsWith("/sell") || p.startsWith("/account") || p.startsWith("/saved") || p.startsWith("/settings");
}

function isDeliveryPath(p: string) {
  return p === "/delivery" || p.startsWith("/delivery/");
}

function isCarrierPath(p: string) {
  return p === "/carrier" || p.startsWith("/carrier/");
}

function isCarrierDeliveryApiPath(p: string) {
  return p.startsWith("/api/carriers") || p.startsWith("/api/carrier") || p.startsWith("/api/delivery");
}

function isAdminDataPath(p: string): boolean {
  return /^\/_next\/data\/[^/]+\/admin(?:\/.*)?\.json$/.test(p);
}

function parseAllow(env?: string | null) {
  return new Set(
    (env ?? "")
      .split(/[,\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

// Compute allowlists once (env won’t change at runtime in Next.js deployments)
const ADMIN_ALLOW = parseAllow(process.env["ADMIN_EMAILS"]);
const SUPERADMIN_ALLOW = parseAllow(process.env["SUPERADMIN_EMAILS"]);

function callbackFromRequestUrl(nextUrl: URL, fallback: string): string {
  try {
    const u = new URL(nextUrl.toString());

    // Prevent nested callbackUrl recursion and avoid leaking test creds into callbackUrl.
    u.searchParams.delete("callbackUrl");
    u.searchParams.delete("redirectTo");
    u.searchParams.delete("email");
    u.searchParams.delete("password");

    // If we are already on an auth page, never use it as callbackUrl.
    const p = (u.pathname || "/").toLowerCase();
    if (p === "/signin" || p === "/signup") return fallback;

    const norm = normalize(u);
    return sanitizeSigninCallbackValue(norm, fallback);
  } catch {
    return fallback;
  }
}

function wantsSignupGoogleFlow(req: NextRequest): boolean {
  if (req.nextUrl.pathname !== "/signup") return false;
  const from = (req.nextUrl.searchParams.get("from") || "").trim().toLowerCase();
  if (from === "google") return true;
  const provider = (req.nextUrl.searchParams.get("provider") || "").trim().toLowerCase();
  if (provider === "google") return true;
  return false;
}

function applyNoStore(headers: Headers) {
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
}

export default auth(async function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  const adminData = isAdminDataPath(p);
  const isApi = p.startsWith("/api/");

  const res = NextResponse.next();
  res.headers.set("X-QS-MW", "1");

  // We need this so /signin and /signup can still get CSP/nonce (document block below),
  // while also enforcing no-store.
  let forceNoStoreForHtml = false;

  // Fast-path excludes
  if (
    req.method === "OPTIONS" ||
    p === "/api/monitoring" ||
    p.startsWith("/_vercel") ||
    p === "/favicon.ico" ||
    p === "/robots.txt" ||
    p === "/sitemap.xml" ||
    p.startsWith("/sitemaps") ||
    p.startsWith("/.well-known") ||
    (p.startsWith("/_next") && !adminData)
  ) {
    return res;
  }

  // Never cache M-Pesa callbacks or auth endpoints
  if (isMpesaCallbackPath(p) || p.startsWith("/api/auth")) {
    applyNoStore(res.headers);
    return res;
  }

  // Basic content-type enforcement for sensitive POSTs
  if (
    (p === "/api/billing/upgrade" && req.method === "POST") ||
    (p.startsWith("/api/products/") && p.endsWith("/promote") && req.method === "POST")
  ) {
    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) {
      return new NextResponse(JSON.stringify({ error: "Bad request" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
  }

  // CORS guard for mutating API calls
  if (isApi && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    if (!isAllowedOrigin(req)) {
      return new NextResponse(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
  }

  // Suggest rate limit
  if (isApi && isSuggestApiPath(p)) {
    const key = rlKeyFromReq(req);
    const now = Date.now();
    const cutoff = now - SUGGEST_WINDOW_MS;

    const arr = SUGGEST_STORE.get(key) ?? [];
    while (arr.length && (arr.at(0) ?? Infinity) <= cutoff) arr.shift();

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

  // NextAuth v5 wrapper provides req.auth (no getToken, no secureCookie drift)
  const session = (req as NextAuthAuthedRequest).auth ?? null;
  const user: any = session?.user ?? null;

  const isLoggedIn = !!user;
  const role = String(user?.role ?? "").toUpperCase();
  const email = typeof user?.email === "string" ? user.email.toLowerCase() : null;

  const allowSuper = !!email && SUPERADMIN_ALLOW.has(email);
  const allowAdmin = !!email && (ADMIN_ALLOW.has(email) || allowSuper);

  const isAdmin =
    user?.isAdmin === true ||
    user?.isSuperAdmin === true ||
    role === "ADMIN" ||
    role === "SUPERADMIN" ||
    allowAdmin;

  // Coarse auth gate for carrier/delivery APIs (Phase 5 will add server-side guards too)
  if (isApi && isCarrierDeliveryApiPath(p)) {
    if (!isLoggedIn) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
  }

  // Protect /_next/data/.../admin*.json
  if (adminData) {
    if (!isLoggedIn) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    if (!isAdmin) {
      return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
  }

  // Admin pages (document navigations only)
  if (!isApi && p.startsWith("/admin") && isDocumentNav(req)) {
    if (!isLoggedIn) {
      const signin = new URL("/signin", req.url);
      const cb = callbackFromRequestUrl(req.nextUrl, "/admin");
      signin.searchParams.set("callbackUrl", cb);
      return NextResponse.redirect(signin, 302);
    }
    if (!isAdmin) {
      return NextResponse.redirect(new URL("/dashboard", req.url), 302);
    }
  }

  // Admin APIs
  if (isApi && p.startsWith("/api/admin")) {
    if (!isLoggedIn) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    if (!isAdmin) {
      return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
  }

  // Auth pages:
  // - Always no-store
  // - Bounce logged-in users away from /signin
  // - Allow logged-in users to access /signup ONLY for Google return flow (?from=google)
  if (!isApi && isAuthPath(p)) {
    forceNoStoreForHtml = true;

    if (isLoggedIn) {
      if (p === "/signup" && wantsSignupGoogleFlow(req)) {
        // ✅ Allow /signup?from=google for authenticated users so they can set a password.
        // Do not redirect; let the page render.
      } else {
        const cbRaw = req.nextUrl.searchParams.get("callbackUrl") || "";
        let target = isAdmin ? "/admin" : "/dashboard";

        if (cbRaw) {
          try {
            const cb = new URL(cbRaw, req.nextUrl);
            if (cb.origin === req.nextUrl.origin) {
              const path = cb.pathname;
              if (path === "/signup" || path === "/signin") {
                target = isAdmin ? "/admin" : "/dashboard";
              } else if (path.startsWith("/admin")) {
                target = isAdmin ? normalize(cb) : "/dashboard";
              } else if (!path.startsWith("/api/auth")) {
                target = normalize(cb);
              }
            }
          } catch {
            if (isSafeInternalPath(cbRaw)) {
              const lower = cbRaw.toLowerCase();
              if (
                lower === "/signup" ||
                lower.startsWith("/signup?") ||
                lower === "/signin" ||
                lower.startsWith("/signin?")
              ) {
                target = isAdmin ? "/admin" : "/dashboard";
              } else if (cbRaw.startsWith("/admin")) {
                target = isAdmin ? cbRaw : "/dashboard";
              } else if (!cbRaw.startsWith("/api/auth")) {
                target = cbRaw;
              }
            }
          }
        }

        return NextResponse.redirect(new URL(target, req.url), 302);
      }
    }
  }

  // Generic protected pages
  if (!isApi && !isLoggedIn && isProtectedPath(p) && isDocumentNav(req)) {
    const signin = new URL("/signin", req.url);
    const cb = callbackFromRequestUrl(req.nextUrl, "/");
    signin.searchParams.set("callbackUrl", cb);
    return NextResponse.redirect(signin, 302);
  }

  // Carrier / Delivery sections
  if (!isApi && !isLoggedIn && (isDeliveryPath(p) || isCarrierPath(p)) && isDocumentNav(req)) {
    const signin = new URL("/signin", req.url);
    const cb = callbackFromRequestUrl(req.nextUrl, "/");
    signin.searchParams.set("callbackUrl", cb);
    return NextResponse.redirect(signin, 302);
  }

  // HTML document: CSP + nonce + device id cookie
  if (isDocumentNav(req)) {
    const preview = process.env["VERCEL_ENV"] === "preview" || process.env["NEXT_PUBLIC_NOINDEX"] === "1";
    const isDevLike = process.env["NODE_ENV"] !== "production" || preview;
    const useReportOnly = isDevLike || process.env["CSP_REPORT_ONLY"] === "1";

    const nonce = makeNonce();
    const forwarded = new Headers(req.headers);
    forwarded.set("x-nonce", nonce);

    const htmlRes = NextResponse.next({ request: { headers: forwarded } });
    htmlRes.headers.set("X-QS-MW", "1");

    if (forceNoStoreForHtml) {
      applyNoStore(htmlRes.headers);
    }

    const sec = buildSecurityHeaders(nonce, {
      allowUnsafeEval: isDevLike,
      isHttps: isHttpsRequest(req),
    });

    for (const [k, v] of sec.entries()) {
      if (k.toLowerCase() === "content-security-policy" && useReportOnly) {
        htmlRes.headers.set("Content-Security-Policy-Report-Only", v);
      } else {
        htmlRes.headers.set(k, v);
      }
    }
    if (useReportOnly) htmlRes.headers.delete("Content-Security-Policy");

    if (!req.cookies.get("qs_did")?.value) {
      const did = makeUUID();
      htmlRes.cookies.set({
        name: "qs_did",
        value: did,
        httpOnly: true,
        sameSite: "lax",
        secure: isHttpsRequest(req),
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return htmlRes;
  }

  return res;
});

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|sitemaps|\\.well-known|_vercel|api/pay/mpesa/callback|api/mpesa/callback).*)",
  ],
};
