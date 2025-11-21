// src/auth.config.ts
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { authCookies } from "@/app/lib/auth-cookies";
import { prisma } from "@/app/lib/prisma";

// ------------------------------- helpers --------------------------------
function splitList(v?: string | null): string[] {
  return (v ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const ADMIN_EMAILS = new Set(splitList(process.env["ADMIN_EMAILS"]));
const SUPERADMIN_EMAILS = new Set(splitList(process.env["SUPERADMIN_EMAILS"]));

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

/** Make the secret a definite string in dev/test to satisfy types */
const SECRET =
  process.env["AUTH_SECRET"] ??
  process.env["NEXTAUTH_SECRET"] ??
  (process.env.NODE_ENV !== "production" ? "dev-secret-change-me" : undefined);

/** Support both object and factory forms for centralized cookie settings */
const cookiesConfig: NextAuthConfig["cookies"] | undefined =
  typeof authCookies === "function"
    ? (authCookies as unknown as () => NextAuthConfig["cookies"])()
    : (authCookies as unknown as NextAuthConfig["cookies"] | undefined);

/* ---------------------------- Google envs ------------------------------ */

const GOOGLE_CLIENT_ID = process.env["GOOGLE_CLIENT_ID"];
const GOOGLE_CLIENT_SECRET = process.env["GOOGLE_CLIENT_SECRET"];

// In production, Google login is mandatory. Fail loud if misconfigured.
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET. " +
        "Google provider is required in production. " +
        "Check Vercel → Project → Environment Variables.",
    );
  } else {
    // In dev/test, we allow running without Google and simply skip the provider.
    // eslint-disable-next-line no-console
    console.warn(
      "[auth] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set; " +
        "Google provider will be disabled in this environment.",
    );
  }
}

// ------------------------------- config ---------------------------------
export const authOptions = {
  debug: process.env["NEXTAUTH_DEBUG"] === "1",
  trustHost: true,

  ...(SECRET ? { secret: SECRET } : {}),
  ...(cookiesConfig ? { cookies: cookiesConfig } : {}),

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
        const E2E_ADMIN_EMAIL = (process.env["E2E_ADMIN_EMAIL"] || "").toLowerCase();
        const E2E_ADMIN_PASSWORD = process.env["E2E_ADMIN_PASSWORD"] || "";
        if (process.env.NODE_ENV !== "production" && email && password) {
          if (email === E2E_ADMIN_EMAIL && password === E2E_ADMIN_PASSWORD) {
            return {
              id: "e2e-admin",
              email,
              name: "E2E Admin",
              role: "ADMIN",
              subscription: "pro",
              username: "admin",
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

        const ok = await bcrypt.compare(password, rawHash);
        if (!ok) {
          return null;
        }

        return {
          id: dbUser.id,
          email: dbUser.email ?? email,
          name: dbUser.name ?? dbUser.email ?? email,
          username: dbUser.username ?? null,
          role:
            typeof dbUser.role === "string" && dbUser.role
              ? dbUser.role
              : "USER",
          subscription:
            typeof dbUser.subscription === "string" && dbUser.subscription
              ? dbUser.subscription
              : null,
        } as any;
      },
    }),

    // Google provider: always configured when envs are present.
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
    // <- This is the flexible redirect from your Option 2
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
            if (
              cb.startsWith("/") &&
              !cb.startsWith("//") &&
              cb !== "/signup"
            ) {
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
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export default authOptions;
