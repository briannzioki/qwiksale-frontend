// src/app/lib/auth-cookies.ts
import "server-only";

/**
 * Centralizes Auth.js cookie policy.
 *
 * Primary goal:
 * - Local/dev/e2e on http://localhost MUST NOT use secure cookies, otherwise
 *   browsers (and Playwright request contexts) will reject Set-Cookie and you
 *   get stuck in /signin loops.
 *
 * Secondary goal:
 * - Real deployed production SHOULD use secure cookie prefixes.
 */

type CookiePolicy = {
  secure: boolean;
  isProdSite: boolean;
  prefix: {
    secure: string; // "__Secure-" when secure, otherwise ""
    host: string; // "__Host-" when secure, otherwise ""
  };
  reason: string;
};

function envStr(name: string): string | undefined {
  const v = process.env[name];
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function envBool(name: string): boolean | undefined {
  const v = envStr(name);
  if (!v) return undefined;
  const s = v.toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return undefined;
}

function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h.endsWith(".localhost");
}

function isE2Eish(): boolean {
  return (
    envBool("NEXT_PUBLIC_E2E") === true ||
    envBool("E2E") === true ||
    envBool("E2E_MODE") === true ||
    envBool("PLAYWRIGHT") === true ||
    envBool("PLAYWRIGHT_TEST") === true ||
    envBool("PW_TEST") === true
  );
}

function siteUrlFromEnv(): string | undefined {
  // Prefer canonical Auth envs first. Then fall back to test/base URL hints.
  return (
    envStr("NEXTAUTH_URL") ??
    envStr("NEXTAUTH_URL_INTERNAL") ??
    envStr("AUTH_URL") ??
    envStr("NEXT_PUBLIC_SITE_URL") ??
    envStr("NEXT_PUBLIC_APP_URL") ??
    envStr("NEXT_PUBLIC_BASE_URL") ??
    envStr("E2E_BASE_URL") ??
    envStr("PLAYWRIGHT_BASE_URL") ??
    envStr("NEXT_PUBLIC_PLAYWRIGHT_BASE_URL")
  );
}

/**
 * "Prod site" = real deployed production (not just NODE_ENV=production).
 * We intentionally keep local `next start` on http://localhost behaving like local.
 */
function isProdSiteResolved(): { isProdSite: boolean; reason: string } {
  if (isE2Eish()) return { isProdSite: false, reason: "e2e" };

  if (process.env["VERCEL_ENV"] != null) {
    return {
      isProdSite: process.env["VERCEL_ENV"] === "production",
      reason: `vercel:${process.env["VERCEL_ENV"]}`,
    };
  }

  if (process.env.NODE_ENV !== "production") return { isProdSite: false, reason: "node_env" };

  const url = siteUrlFromEnv();
  if (!url) return { isProdSite: false, reason: "no_url" };

  try {
    const u = new URL(url);
    if (isLocalHost(u.hostname)) return { isProdSite: false, reason: "localhost_url" };
    return { isProdSite: true, reason: "node_env+non_local_url" };
  } catch {
    // If URL parsing fails but NODE_ENV is production, treat as prod-like.
    return { isProdSite: true, reason: "node_env+unparseable_url" };
  }
}

function computeSecureCookieFlag(): { secure: boolean; isProdSite: boolean; reason: string } {
  // Hard rule: E2E runs use http://localhost by default => secure cookies break Playwright.
  if (isE2Eish()) return { secure: false, isProdSite: false, reason: "e2e_forces_insecure" };

  const prod = isProdSiteResolved();
  if (!prod.isProdSite) return { secure: false, isProdSite: false, reason: prod.reason };

  const url = siteUrlFromEnv();
  if (!url) return { secure: true, isProdSite: true, reason: "prod_no_url_assume_https" };

  try {
    const u = new URL(url);
    if (isLocalHost(u.hostname)) {
      return { secure: false, isProdSite: false, reason: "localhost_url" };
    }
    return { secure: u.protocol === "https:", isProdSite: true, reason: `prod_${u.protocol}` };
  } catch {
    return { secure: true, isProdSite: true, reason: "prod_unparseable_url_assume_https" };
  }
}

/**
 * Public API used by src/auth.config.ts
 */
export function authCookiePolicy(): CookiePolicy {
  const { secure, isProdSite, reason } = computeSecureCookieFlag();
  return {
    secure,
    isProdSite,
    prefix: {
      secure: secure ? "__Secure-" : "",
      host: secure ? "__Host-" : "",
    },
    reason,
  };
}

type CookieOptions = {
  httpOnly?: boolean;
  sameSite?: "lax" | "strict" | "none";
  path?: string;
  secure?: boolean;
  domain?: string;
  maxAge?: number;
};

function baseOpts(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
  };
}

/**
 * Auth.js cookie map.
 * Typed as `any` to stay compatible across Auth.js / NextAuth minor changes.
 */
export function authCookies(): any {
  const policy = authCookiePolicy();
  const secure = policy.secure;

  // Auth.js v5 defaults are `authjs.*` (not `next-auth.*`).
  // We keep that convention, only adding secure prefixes when appropriate.
  const name = (raw: string) => `${policy.prefix.secure}${raw}`;
  const hostName = (raw: string) => `${policy.prefix.host}${raw}`;

  const sessionTokenName = name("authjs.session-token");
  const callbackUrlName = name("authjs.callback-url");
  const csrfTokenName = hostName("authjs.csrf-token");
  const pkceName = name("authjs.pkce.code_verifier");
  const stateName = name("authjs.state");
  const nonceName = name("authjs.nonce");

  return {
    sessionToken: {
      name: sessionTokenName,
      options: {
        ...baseOpts(secure),
        // Session token should always be httpOnly
        httpOnly: true,
      },
    },

    callbackUrl: {
      name: callbackUrlName,
      options: {
        ...baseOpts(secure),
        // NextAuth may read this in the browser in some flows
        httpOnly: false,
      },
    },

    csrfToken: {
      name: csrfTokenName,
      options: {
        ...baseOpts(secure),
        // NextAuth uses double-submit; keep it httpOnly (server reads it)
        httpOnly: true,
        // __Host- requires path=/ and no domain, which we satisfy.
      },
    },

    pkceCodeVerifier: {
      name: pkceName,
      options: {
        ...baseOpts(secure),
        httpOnly: true,
      },
    },

    state: {
      name: stateName,
      options: {
        ...baseOpts(secure),
        httpOnly: true,
      },
    },

    nonce: {
      name: nonceName,
      options: {
        ...baseOpts(secure),
        httpOnly: true,
      },
    },
  };
}
