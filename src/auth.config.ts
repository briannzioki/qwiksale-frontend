// src/auth.config.ts
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authCookies } from "@/app/lib/auth-cookies";

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

        // E2E/dev admin backdoor
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
          // Dev/E2E: allow known DB user by email (no password check)
          try {
            const { prisma } = await import("@/app/lib/prisma");
            const dbUser =
              (await prisma.user.findUnique({
                where: { email },
                select: { id: true, email: true, name: true, username: true, role: true, subscription: true },
              })) || null;
            if (dbUser) {
              return {
                id: dbUser.id,
                email: dbUser.email ?? email,
                name: dbUser.name ?? null,
                username: dbUser.username ?? null,
                role: (dbUser as any).role ?? "USER",
                subscription: (dbUser as any).subscription ?? null,
              } as any;
            }
          } catch {
            // ignore and fall through
          }
        }

        // TODO: Implement real password verification in prod
        return null;
      },
    }),
  ],

  callbacks: {
    async redirect({ url, baseUrl }) {
      // allow-list for stable in-app redirects
      const ALLOWED = new Set<string>([
        "/",
        "/dashboard",
        "/sell",
        "/saved",
        "/account/profile",
        "/account/complete-profile",
        "/admin",
        "/admin/users",
        "/admin/listings",
        "/search",
      ]);

      try {
        const base = new URL(baseUrl);
        const u = new URL(url, baseUrl);

        // Block external origins
        if (u.origin !== base.origin) return baseUrl;

        // Never bounce to /signup from callbacks
        if (u.pathname === "/signup") return baseUrl;

        // Prefer explicit, safe callbackUrl if present
        const cb = u.searchParams.get("callbackUrl");
        if (cb) {
          try {
            const cbu = new URL(cb, baseUrl);
            if (
              cbu.origin === base.origin &&
              cbu.pathname !== "/signup" &&
              (ALLOWED.has(cbu.pathname) || cbu.pathname === "/")
            ) {
              return toRelativeIfSameOrigin(cbu.toString(), baseUrl);
            }
          } catch {
            if (cb.startsWith("/") && (ALLOWED.has(cb) || cb === "/")) return cb;
          }
        }

        // Else, if the target itself is safe, allow it
        if (ALLOWED.has(u.pathname) || u.pathname === "/") {
          return toRelativeIfSameOrigin(u.toString(), baseUrl);
        }
      } catch {
        if (typeof url === "string" && url.startsWith("/")) return url;
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
