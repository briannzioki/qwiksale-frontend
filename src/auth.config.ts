// src/auth.config.ts
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { authCookies } from "@/app/lib/auth-cookies";
import { prisma } from "@/app/lib/prisma";
import * as referralCookie from "@/app/lib/referral-cookie";
import * as referrals from "@/app/lib/referrals";

/* ---------------------------- env helpers ------------------------------ */

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
 * Real production deployment detector (not just NODE_ENV=production).
 * - Vercel: VERCEL_ENV=production
 * - Else: NODE_ENV=production AND NEXTAUTH_URL host is not localhost-ish
 */
function isProdSite(): boolean {
  if (process.env["VERCEL_ENV"] != null) {
    return process.env["VERCEL_ENV"] === "production";
  }

  if (process.env.NODE_ENV !== "production") return false;

  const url = siteUrlFromEnv();
  if (!url) return true; // misconfigured prod should fail loud below

  try {
    const host = new URL(url).hostname;
    return !isLocalHost(host);
  } catch {
    return true;
  }
}

function cookieSecureFromEnv(): boolean {
  const forced = envStr("AUTH_COOKIE_SECURE");
  if (forced === "1") return true;
  if (forced === "0") return false;

  const url = siteUrlFromEnv();
  if (!url) return process.env.NODE_ENV === "production";

  try {
    return new URL(url).protocol === "https:";
  } catch {
    return process.env.NODE_ENV === "production";
  }
}

const IS_PROD_SITE = isProdSite();
const COOKIE_SECURE = cookieSecureFromEnv();

// ------------------------------- helpers --------------------------------
function splitList(v?: string | null): string[] {
  return (v ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const ADMIN_EMAILS = new Set(splitList(process.env["ADMIN_EMAILS"]));
const SUPERADMIN_EMAILS = new Set(splitList(process.env["SUPERADMIN_EMAILS"]));

function readStringField(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as any)[key];
  return typeof v === "string" && v ? v : null;
}

/** same-origin → return relative href; otherwise keep as-is */
function toRelativeIfSameOrigin(urlStr: string, baseUrl: string): string {
  try {
    const base = new URL(baseUrl);
    const u = new URL(urlStr, baseUrl);
    if (u.origin === base.origin) return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    // ignore
  }
  return urlStr;
}

const REF_CODE_RE = /^[A-Za-z0-9._-]{3,64}$/;

async function autoClaimReferralOnce(meId: string) {
  if (!meId) return;

  const rc: any = referralCookie as any;

  const readFn =
    rc.readReferralCookie ??
    rc.getReferralCookie ??
    rc.getReferralCode ??
    rc.readReferralCode;

  const clearFn =
    rc.clearReferralCookie ??
    rc.deleteReferralCookie ??
    rc.unsetReferralCookie ??
    rc.clearReferralCookie ??
    rc.clearReferralCode;

  let codeRaw: unknown = null;
  try {
    codeRaw = typeof readFn === "function" ? await readFn() : null;
  } catch {
    codeRaw = null;
  }

  let code = "";
  if (typeof codeRaw === "string") code = codeRaw.trim();
  else if (codeRaw && typeof (codeRaw as any).code === "string") {
    code = String((codeRaw as any).code).trim();
  }

  if (!code) return;

  try {
    if (!REF_CODE_RE.test(code)) return;

    const claim = (referrals as any).claimReferral as
      | ((args: { meId: string; code: string }) => Promise<unknown>)
      | undefined;

    if (typeof claim === "function") {
      await claim({ meId, code });
    }
  } catch {
    // swallow: idempotent helper may throw; we still clear cookie so it doesn't loop forever
  } finally {
    try {
      if (typeof clearFn === "function") {
        await clearFn();
        return;
      }

      const name =
        rc.REFERRAL_COOKIE_NAME ??
        rc.REF_COOKIE_NAME ??
        rc.referralCookieName ??
        rc.cookieName;

      if (typeof name === "string" && name) {
        const { cookies } = await import("next/headers");
        const res: any = (cookies as any)();
        const jar: any = typeof res?.then === "function" ? await res : res;
        jar?.set?.(name, "", { path: "/", expires: new Date(0) });
      }
    } catch {
      // ignore
    }
  }
}

/**
 * Secret:
 * - real prod site: MUST be set (fail loud)
 * - dev/e2e/local-prod-on-http: stable fallback to avoid "MissingCSRF" and JWT mismatch
 *
 * IMPORTANT: treat empty strings as "unset".
 */
const SECRET =
  envStr("AUTH_SECRET") ??
  envStr("NEXTAUTH_SECRET") ??
  (!IS_PROD_SITE ? "dev-secret-change-me" : undefined);

// In production deployment, the secret must be set. Fail loud if misconfigured.
if (IS_PROD_SITE && !SECRET) {
  throw new Error(
    "Missing AUTH_SECRET (or NEXTAUTH_SECRET). " +
      "NextAuth requires a secret in production. " +
      "Check Vercel → Project → Environment Variables.",
  );
}

/** Support both object and factory forms for centralized cookie settings */
const cookiesConfig: NextAuthConfig["cookies"] | undefined =
  typeof authCookies === "function"
    ? (authCookies as unknown as () => NextAuthConfig["cookies"])()
    : (authCookies as unknown as NextAuthConfig["cookies"] | undefined);

/**
 * CSRF hardening:
 * Ensure csrf cookie defaults stay compatible with http://localhost (Playwright),
 * even if someone changes the central cookie config.
 */
function withPatchedCsrfCookie(
  input: NextAuthConfig["cookies"] | undefined,
  secure: boolean,
): NextAuthConfig["cookies"] | undefined {
  if (!input) return input;

  const c: any = input as any;
  const csrf = c?.csrfToken;

  if (!csrf || typeof csrf !== "object") return input;

  return {
    ...c,
    csrfToken: {
      ...csrf,
      options: {
        ...(csrf as any).options,
        sameSite: "lax",
        secure,
        path: "/",
      },
    },
  } as NextAuthConfig["cookies"];
}

const COOKIES = withPatchedCsrfCookie(cookiesConfig, COOKIE_SECURE);

/* ---------------------------- Google envs ------------------------------ */

const GOOGLE_CLIENT_ID =
  envStr("GOOGLE_CLIENT_ID") ?? (IS_PROD_SITE ? undefined : "dev-google-client-id");

const GOOGLE_CLIENT_SECRET =
  envStr("GOOGLE_CLIENT_SECRET") ??
  (IS_PROD_SITE ? undefined : "dev-google-client-secret");

// In production deployment, Google login is mandatory. Fail loud if misconfigured.
if (IS_PROD_SITE && (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET)) {
  throw new Error(
    "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET. " +
      "Google provider is required in production. " +
      "Check Vercel → Project → Environment Variables.",
  );
}

/* ----------------------------- debug gate ------------------------------ */
/**
 * Debug safety:
 * - OFF by default.
 * - NEVER enabled in production.
 * - ONLY enabled in development when explicitly requested.
 */
const WANT_DEBUG =
  process.env["NEXTAUTH_DEBUG"] === "1" ||
  process.env["AUTH_DEBUG"] === "1" ||
  process.env["NEXT_PUBLIC_AUTH_DEBUG"] === "1";

const AUTH_DEBUG = process.env.NODE_ENV === "development" && WANT_DEBUG;

// ------------------------------- config ---------------------------------
export const authOptions = {
  debug: AUTH_DEBUG,
  trustHost: true,

  ...(SECRET ? { secret: SECRET } : {}),
  ...(COOKIES ? { cookies: COOKIES } : {}),

  session: {
    strategy: "jwt" as const,
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },

  pages: {
    signIn: "/signin",
  },

  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const email = (creds?.email || "").toString().trim().toLowerCase();
        const password = (creds?.password || "").toString();

        if (!email || !password) {
          return null;
        }

        // E2E/dev admin backdoor (only when NOT in production)
        // IMPORTANT: must return the REAL DB user id for this email,
        // otherwise API routes that query prisma.user by id will 401.
        const E2E_ADMIN_EMAIL = (envStr("E2E_ADMIN_EMAIL") || "").toLowerCase();
        const E2E_ADMIN_PASSWORD = envStr("E2E_ADMIN_PASSWORD") || "";

        if (!IS_PROD_SITE) {
          if (email === E2E_ADMIN_EMAIL && password === E2E_ADMIN_PASSWORD) {
            const existing = (await prisma.user.findUnique({
              where: { email },
              select: { id: true } as any,
            })) as unknown;

            const existingId = readStringField(existing, "id");

            if (existingId) {
              // Best-effort: keep the DB row aligned with what tests expect.
              try {
                await prisma.user.update({
                  where: { id: existingId } as any,
                  data: {
                    role: "ADMIN",
                    subscription: "BASIC",
                    suspended: false,
                    banned: false,
                  } as any,
                  select: { id: true } as any,
                });
              } catch {
                // ignore (schema drift / enum drift)
              }

              return {
                id: existingId,
                email,
                name: "E2E Admin",
                role: "ADMIN",
                subscription: "BASIC",
                username: "e2e-admin",
              } as any;
            }

            // If global-setup didn't create it for some reason, create a real row.
            const created = (await prisma.user.create({
              data: {
                email,
                role: "ADMIN",
                subscription: "BASIC",
                suspended: false,
                banned: false,
                verified: true,
                username: "e2e-admin",
                name: "E2E Admin",
              } as any,
              select: { id: true } as any,
            })) as unknown;

            const createdId = readStringField(created, "id");
            if (!createdId) return null;

            return {
              id: createdId,
              email,
              name: "E2E Admin",
              role: "ADMIN",
              subscription: "BASIC",
              username: "e2e-admin",
            } as any;
          }
        }

        // Real password verification (all environments)
        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          return null;
        }

        const dbUser = user as any;
        const rawHash = dbUser.passwordHash ?? dbUser.password;

        if (typeof rawHash !== "string" || !rawHash) {
          return null;
        }

        // Guard against malformed/legacy hashes (prevents random 500s)
        let ok = false;
        try {
          ok = await bcrypt.compare(password, rawHash);
        } catch {
          return null;
        }
        if (!ok) {
          return null;
        }

        return {
          id: String(dbUser.id),
          email: dbUser.email ?? email,
          name: dbUser.name ?? dbUser.email ?? email,
          username: dbUser.username ?? null,
          role: typeof dbUser.role === "string" && dbUser.role ? dbUser.role : "USER",
          subscription:
            typeof dbUser.subscription === "string" && dbUser.subscription
              ? dbUser.subscription
              : null,
        } as any;
      },
    }),

    // Google provider:
    // - prod site: must have real envs (enforced above)
    // - dev/test: expose provider using safe placeholder creds so UI + endpoints stay healthy
    ...(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: GOOGLE_CLIENT_ID,
            clientSecret: GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],

  callbacks: {
    async redirect({ url, baseUrl }) {
      try {
        const base = new URL(baseUrl);
        const u = new URL(url, baseUrl);

        // Block external origins completely
        if (u.origin !== base.origin) {
          return baseUrl;
        }

        // Prefer explicit callbackUrl if present and safe
        const cb = u.searchParams.get("callbackUrl");
        if (cb) {
          try {
            const cbu = new URL(cb, baseUrl);
            if (cbu.origin === base.origin) {
              if (cbu.pathname === "/signup") return baseUrl;
              return toRelativeIfSameOrigin(cbu.toString(), baseUrl);
            }
          } catch {
            if (cb.startsWith("/") && !cb.startsWith("//") && cb !== "/signup") {
              return cb;
            }
          }
        }

        // Otherwise, use the target URL itself if it's same-origin & safe.
        if (u.pathname === "/signup") {
          return baseUrl;
        }

        return toRelativeIfSameOrigin(u.toString(), baseUrl);
      } catch {
        if (
          typeof url === "string" &&
          url.startsWith("/") &&
          !url.startsWith("//") &&
          url !== "/signup"
        ) {
          return url;
        }
      }

      return baseUrl;
    },

    async jwt({ token, user }: { token: any; user?: any }) {
      // On sign-in: only set concrete strings (avoid nulls)
      if (user) {
        const uid = (user as any).id;
        if (typeof uid === "string" && uid) token.uid = uid;

        const uemail = (user as any).email;
        if (typeof uemail === "string") token.email = uemail;

        const urole = (user as any).role;
        token.role = typeof urole === "string" && urole ? urole : (token.role ?? "USER");

        const usub = (user as any).subscription;
        if (typeof usub === "string") token.subscription = usub;

        const uname = (user as any).username;
        if (typeof uname === "string") token.username = uname;
      }

      // Normalize/upgrade role based on allow-lists
      const email = (token.email ?? "").toString().toLowerCase();
      if (SUPERADMIN_EMAILS.has(email)) token.role = "SUPERADMIN";
      else if (ADMIN_EMAILS.has(email) && token.role === "USER") token.role = "ADMIN";

      return token;
    },

    async session({ session, token }: { session: any; token: any }) {
      if (session?.user) {
        // Only assign when we have strings; never write nulls
        if (typeof token.uid === "string" && token.uid) {
          session.user.id = token.uid;
        }
        if (typeof token.username === "string") {
          session.user.username = token.username;
        }
        if (typeof token.subscription === "string") {
          session.user.subscription = token.subscription as any;
        }

        // Compute role
        let role: string = typeof token.role === "string" && token.role ? token.role : "USER";
        const email = (token.email ?? session.user.email ?? "").toString().toLowerCase();
        if (SUPERADMIN_EMAILS.has(email)) role = "SUPERADMIN";
        else if (ADMIN_EMAILS.has(email) && role === "USER") role = "ADMIN";

        session.user.role = role;
        (session.user as any).isSuperAdmin = role === "SUPERADMIN";
        (session.user as any).isAdmin = role === "ADMIN" || role === "SUPERADMIN";

        // Auto-claim referral exactly once after auth (cookie → claim → clear).
        if (typeof session.user.id === "string" && session.user.id) {
          await autoClaimReferralOnce(session.user.id);
        }
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export default authOptions;
