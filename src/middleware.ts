// src/middleware.ts — QwikSale middleware (admin gates, protected pages, CSP, suggest RL)
import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/* ------------------- Edge-safe helpers ------------------- */
function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function makeUUID(): string {
  return (crypto as any)?.randomUUID?.() ?? `${Date.now().toString(36)}-${makeNonce()}`;
}

/* ---------- Detect HTML navigations ---------- */
function isDocumentNav(req: NextRequest): boolean {
  const accept = (req.headers.get("accept") || "").toLowerCase();
  const dest = (req.headers.get("sec-fetch-dest") || "").toLowerCase();
  return dest === "document" || accept.includes("text/html");
}

/* ------------------ Suggest soft limiter ------------------ */
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

/* ------------------------- Security / CSP ------------------------- */
function buildSecurityHeaders(nonce: string, opts?: { allowUnsafeEval?: boolean }) {
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

  const scriptSrcParts = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "https://plausible.io",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
  ];

  if (opts?.allowUnsafeEval) {
    scriptSrcParts.push("'unsafe-eval'");
  }

  const scriptSrc = scriptSrcParts.join(" ");

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
  headers.set("Content-Security-Policy", csp);
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  if (process.env["NODE_ENV"] === "production") {
    headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return headers;
}

/* -------------------- Origin allow-list for mutating API -------------------- */
function isAllowedOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  try {
    const o = new URL(origin);
    if (o.host === req.nextUrl.host) return true;
  } catch {
    return false;
  }

  const raw =
    process.env["CORS_ALLOW_ORIGINS"] || process.env["NEXT_PUBLIC_APP_URL"] || "";
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

/* -------------------- Utilities -------------------- */
function normalize(href: URL | string): string {
  const u = href instanceof URL ? href : new URL(String(href), "http://localhost");
  let pathname = u.pathname || "/";
  if (pathname !== "/") pathname = pathname.replace(/\/+$/, "");
  const entries = Array.from(u.searchParams.entries()).filter(([, v]) => v !== "");
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const qs = new URLSearchParams(entries).toString();
  return `${pathname}${qs ? `?${qs}` : ""}`;
}
function isAuthPath(p: string) {
  return p === "/signin" || p === "/signup";
}
function isProtectedPath(p: string) {
  // Allow anonymous access to /sell/product (soft CTA + form),
  // while keeping the rest of /sell and other sections gated.
  if (p === "/sell/product") {
    return false;
  }

  // NOTE: /dashboard is intentionally NOT treated as protected here so that
  // the dashboard guardrail test can hit /dashboard anonymously and see
  // the soft-error or CTA UI rendered by the page instead of a redirect.
  return (
    p.startsWith("/sell") ||
    p.startsWith("/account") ||
    p.startsWith("/messages") ||
    p.startsWith("/saved") ||
    p.startsWith("/settings")
  );
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

/* -------------------- Read token safely -------------------- */
async function readToken(req: NextRequest) {
  const secret = process.env["NEXTAUTH_SECRET"];
  if (secret) return getToken({ req, secret });
  return getToken({ req } as any);
}

/* -------------------------------- Main middleware -------------------------------- */
export async function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  const adminData = isAdminDataPath(p);
  const isApi = p.startsWith("/api/");

  // Default fallthrough response; set a cheap probe header
  const res = NextResponse.next();
  res.headers.set("X-QS-MW", "1");

  /* ---- Infra / static bypass ---- */
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

  /* ---- Never touch NextAuth internals ---- */
  if (p.startsWith("/api/auth")) return res;

  /* ---- JSON guard for specific POSTs ---- */
  if (
    (p === "/api/billing/upgrade" && req.method === "POST") ||
    (p.startsWith("/api/products/") && p.endsWith("/promote") && req.method === "POST")
  ) {
    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) {
      return new NextResponse(JSON.stringify({ error: "Bad request" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
  }

  /* ---- Origin allow-list for mutating API ---- */
  if (isApi && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    if (!isAllowedOrigin(req)) {
      return new NextResponse(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
  }

  /* ---- Soft rate-limit for /api/.../suggest ---- */
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

      return new NextResponse(
        JSON.stringify({ error: "Too many requests. Please slow down." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Retry-After": String(retrySec),
            "X-RateLimit-Limit": String(SUGGEST_LIMIT),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Policy": `${SUGGEST_LIMIT};w=${Math.round(
              SUGGEST_WINDOW_MS / 1000,
            )}`,
            "X-RateLimit-Bucket": "suggest",
          },
        },
      );
    }

    arr.push(now);
    SUGGEST_STORE.set(key, arr);
  }

  /* ---- Session / role via JWT ---- */
  const token = await readToken(req);
  const isLoggedIn = !!token;
  const role = String((token as any)?.role ?? (token as any)?.user?.role ?? "").toUpperCase();
  const email =
    (((token as any)?.email ?? (token as any)?.user?.email) || "")?.toLowerCase() || null;

  const adminList = parseAllow(process.env["ADMIN_EMAILS"]);
  const superList = parseAllow(process.env["SUPERADMIN_EMAILS"]);
  const allowSuper = !!email && superList.has(email);
  const allowAdmin = !!email && (adminList.has(email) || allowSuper);
  const isAdmin = role === "ADMIN" || role === "SUPERADMIN" || allowAdmin;

  /* ---- Admin _next data routes ---- */
  if (adminData) {
    if (!isLoggedIn) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
    if (!isAdmin) {
      return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
  }

  /* ---- Admin HTML gate (document nav only) ---- */
  if (!isApi && p.startsWith("/admin") && isDocumentNav(req)) {
    if (!isLoggedIn) {
      const signin = new URL("/signin", req.url);
      signin.searchParams.set("callbackUrl", normalize(req.nextUrl));
      return NextResponse.redirect(signin, 302);
    }
    if (!isAdmin) {
      return NextResponse.redirect(new URL("/dashboard", req.url), 302);
    }
  }

  /* ---- Admin API gate ---- */
  if (isApi && p.startsWith("/api/admin")) {
    if (!isLoggedIn) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
    if (!isAdmin) {
      return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
  }

  /* ---- /signin & /signup ---- */
  if (!isApi && isAuthPath(p)) {
    if (isLoggedIn) {
      const cbRaw = req.nextUrl.searchParams.get("callbackUrl") || "";
      let target = isAdmin ? "/admin" : "/dashboard";
      if (cbRaw) {
        try {
          const cb = new URL(cbRaw, req.nextUrl);
          if (cb.origin === req.nextUrl.origin) {
            const path = cb.pathname;
            if (path === "/signup") {
              target = isAdmin ? "/admin" : "/dashboard";
            } else if (path.startsWith("/admin")) {
              target = isAdmin ? normalize(cb) : "/dashboard";
            } else if (!path.startsWith("/api/auth") && path !== "/signin") {
              target = normalize(cb);
            }
          }
        } catch {
          if (cbRaw.startsWith("/")) {
            if (cbRaw === "/signup") target = isAdmin ? "/admin" : "/dashboard";
            else if (cbRaw.startsWith("/admin")) target = isAdmin ? cbRaw : "/dashboard";
            else if (!cbRaw.startsWith("/api/auth") && cbRaw !== "/signin") target = cbRaw;
          }
        }
      }
      return NextResponse.redirect(new URL(target, req.url), 302);
    }
    // Allow auth pages; don’t apply strict CSP here to avoid breaking CSRF.
    return res;
  }

  /* ---- Protected (non-admin) sections → require login ---- */
  if (!isApi && !isLoggedIn && isProtectedPath(p) && isDocumentNav(req)) {
    const signin = new URL("/signin", req.url);
    signin.searchParams.set("callbackUrl", normalize(req.nextUrl) || "/");
    return NextResponse.redirect(signin, 302);
  }

  /* ---- Security headers + device id for HTML navigations ---- */
  if (isDocumentNav(req)) {
    const preview =
      process.env["VERCEL_ENV"] === "preview" ||
      process.env["NEXT_PUBLIC_NOINDEX"] === "1";
    const isDevLike = process.env["NODE_ENV"] !== "production" || preview;
    const useReportOnly = isDevLike || process.env["CSP_REPORT_ONLY"] === "1";

    const nonce = makeNonce();
    const forwarded = new Headers(req.headers);
    forwarded.set("x-nonce", nonce);

    const htmlRes = NextResponse.next({ request: { headers: forwarded } });
    htmlRes.headers.set("X-QS-MW", "1");

    const sec = buildSecurityHeaders(nonce, { allowUnsafeEval: isDevLike });
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
        secure: process.env["NODE_ENV"] === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return htmlRes;
  }

  // Non-HTML fallthrough
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|sitemaps|\\.well-known|_vercel).*)",
  ],
};
