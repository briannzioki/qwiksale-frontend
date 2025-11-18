// src/app/lib/auth-cookies.ts
import type { NextAuthConfig } from "next-auth";

/**
 * Compute a cookie domain that:
 * - Is only applied in production (or when PRIMARY_DOMAIN_ENFORCE !== "0")
 * - Is never applied on localhost / 127.0.0.1 / *.localhost
 * - Strips leading "www." so cookies work across apex + www
 *
 * This keeps your dev environment sane while making sure production
 * sessions are valid on both https://qwiksale.sale and https://www.qwiksale.sale
 * when you need that.
 */
function computeCookieDomain(): string | undefined {
  // Only pin a domain in production AND when not on localhost, unless explicitly disabled.
  const enforce = (process.env["PRIMARY_DOMAIN_ENFORCE"] ?? "1") !== "0";
  const url =
    process.env["NEXTAUTH_URL"] ??
    process.env["NEXT_PUBLIC_SITE_URL"] ??
    "";

  if (!url || !enforce) {
    return undefined;
  }

  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const isLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".localhost");

    // Don't set a domain for local-style hosts or bare TLD-less hosts
    if (isLocal || !host.includes(".")) return undefined;

    return `.${host}`;
  } catch {
    return undefined;
  }
}

/**
 * Centralized cookie definitions for Auth.js (NextAuth v5).
 * We stick close to the v5 defaults but add:
 * - Proper "__Secure-" prefix in production for sessionToken
 * - Single, optional domain for cross-subdomain sessions in prod
 */
export function authCookies(): NonNullable<NextAuthConfig["cookies"]> {
  const domain = computeCookieDomain();
  const secure = process.env.NODE_ENV === "production";

  const base = {
    sameSite: "lax" as const,
    path: "/",
    secure,
  };

  return {
    // Auth.js v5 default names; use domain only in prod sites.
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
