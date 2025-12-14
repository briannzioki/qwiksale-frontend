// src/app/lib/auth-cookies.ts
import type { NextAuthConfig } from "next-auth";

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
 * This prevents "next start" on http://localhost from behaving like real prod.
 */
function isProdSite(): boolean {
  if (process.env["VERCEL_ENV"] != null) {
    return process.env["VERCEL_ENV"] === "production";
  }

  if (process.env.NODE_ENV !== "production") return false;

  const url = siteUrlFromEnv();
  if (!url) return true; // misconfigured prod: treat as prod to fail loud elsewhere

  try {
    const host = new URL(url).hostname;
    return !isLocalHost(host);
  } catch {
    return true;
  }
}

/**
 * Cookies must NOT be `secure: true` on http://localhost even if NODE_ENV=production
 * (common with `next start`). Derive from NEXTAUTH_URL (or friends).
 */
function computeCookieSecure(): boolean {
  const forced = envStr("AUTH_COOKIE_SECURE");
  if (forced === "1") return true;
  if (forced === "0") return false;

  const url = siteUrlFromEnv();
  if (!url) return process.env.NODE_ENV === "production";

  try {
    const u = new URL(url);
    return u.protocol === "https:";
  } catch {
    return process.env.NODE_ENV === "production";
  }
}

/**
 * Compute a cookie domain that:
 * - Is only applied on real production sites (or when PRIMARY_DOMAIN_ENFORCE !== "0")
 * - Is never applied on localhost / 127.0.0.1 / *.localhost
 * - Strips leading "www." so cookies work across apex + www
 *
 * This keeps dev/E2E sane while allowing production cross-subdomain sessions.
 */
function computeCookieDomain(): string | undefined {
  const enforce = (process.env["PRIMARY_DOMAIN_ENFORCE"] ?? "1") !== "0";

  if (!enforce || !isProdSite()) {
    return undefined;
  }

  const url = siteUrlFromEnv();
  if (!url) return undefined;

  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (isLocalHost(host) || !host.includes(".")) return undefined;
    return `.${host}`;
  } catch {
    return undefined;
  }
}

/**
 * Centralized cookie definitions for Auth.js (NextAuth v5).
 * We stick close to the v5 defaults but add:
 * - Proper "__Secure-" prefix only when actually HTTPS
 * - Single, optional domain for cross-subdomain sessions on real prod sites
 */
export function authCookies(): NonNullable<NextAuthConfig["cookies"]> {
  const domain = computeCookieDomain();
  const secure = computeCookieSecure();

  const base = {
    sameSite: "lax" as const,
    path: "/",
    secure,
  };

  return {
    sessionToken: {
      name: secure ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        ...base,
        httpOnly: true,
        ...(domain ? { domain } : {}),
      },
    },
    csrfToken: {
      name: "authjs.csrf-token",
      options: {
        ...base,
        httpOnly: true,
        ...(domain ? { domain } : {}),
      },
    },
    callbackUrl: {
      name: "authjs.callback-url",
      options: {
        ...base,
        ...(domain ? { domain } : {}),
      },
    },
    state: {
      name: "authjs.state",
      options: {
        ...base,
        httpOnly: true,
        ...(domain ? { domain } : {}),
      },
    },
  };
}
