// src/app/api/auth/[...nextauth]/authOptions.ts
import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

// ⬇️ Use the same prisma instance path as the rest of the app
import { prisma } from "@/app/lib/prisma";

// If your password helpers live elsewhere, adjust the path accordingly.
import { verifyPassword, hashPassword } from "@/server/auth";

/**
 * Hardened & typed NextAuth config
 * - JWT sessions (no DB sessions)
 * - SameSite=Lax, HttpOnly, __Secure- cookie in prod with apex domain
 * - Extends the session token with uid/subscription/username/referralCode
 * - Defensive credentials authorize() (no enumeration, optional auto-signup)
 * - Redirect callback that ignores bad/stale callback cookies (e.g., /signup)
 */

const isProd = process.env.NODE_ENV === "production";

// If you host multiple subdomains, set NEXTAUTH_COOKIE_DOMAIN (e.g., .qwiksale.sale)
const cookieDomain =
  isProd && process.env["NEXTAUTH_COOKIE_DOMAIN"]
    ? process.env["NEXTAUTH_COOKIE_DOMAIN"]
    : isProd
    ? ".qwiksale.sale"
    : undefined;

const ALLOW_CREDS_AUTO_SIGNUP =
  (process.env["ALLOW_CREDS_AUTO_SIGNUP"] ?? "1") === "1";

// Allow only these internal landings; never /signup
const ALLOWED_CALLBACK_PATHS = new Set<string>([
  "/",
  "/sell",
  "/account/profile",
  "/account/complete-profile",
]);

export const authOptions: NextAuthOptions = {
  debug: process.env["NEXTAUTH_DEBUG"] === "1",

  ...(process.env["NEXTAUTH_SECRET"] ? { secret: process.env["NEXTAUTH_SECRET"]! } : {}),

  adapter: PrismaAdapter(prisma),

  session: {
    strategy: "jwt",
    // token lifetime (30d) & rolling refresh window (24h)
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },

  cookies: {
    // Use a __Secure- cookie in production on HTTPS
    sessionToken: {
      name: isProd ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        secure: isProd,
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      },
    },
  },

  pages: { signIn: "/signin" },

  providers: [
    Credentials({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim() || "";
        const password = credentials?.password ?? "";

        // Basic gate to avoid user enumeration
        const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!EMAIL_RE.test(email) || password.length < 6) {
          await new Promise((r) => setTimeout(r, 250));
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            passwordHash: true,
            // accounts: { select: { provider: true }, take: 1 }, // keep if needed later
            subscription: true,
            username: true,
            referralCode: true,
          },
        });

        if (user) {
          // Password-less account (e.g., Google-only)
          if (!user.passwordHash) {
            throw new Error(
              "This email is linked to a social login. Use “Continue with Google”."
            );
          }
          const ok = await verifyPassword(password, user.passwordHash);
          if (!ok) {
            await new Promise((r) => setTimeout(r, 250));
            return null;
          }
          return {
            id: user.id,
            email: user.email,
            name: user.name ?? null,
            image: user.image ?? null,
          };
        }

        // Optional auto-signup for new email+password users
        if (!ALLOW_CREDS_AUTO_SIGNUP) {
          await new Promise((r) => setTimeout(r, 250));
          return null;
        }

        const passwordHash = await hashPassword(password);
        const created = await prisma.user.create({
          data: { email, passwordHash },
          select: { id: true, email: true },
        });
        return { id: created.id, email: created.email };
      },
    }),

    // Google (optional if env vars missing)
    ...(process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]
      ? [
          Google({
            clientId: process.env["GOOGLE_CLIENT_ID"]!,
            clientSecret: process.env["GOOGLE_CLIENT_SECRET"]!,
          }),
        ]
      : []),
  ],

  callbacks: {
    // 🧭 Neutralize stale/bad callback cookies & force safe, same-origin paths
    async redirect({ url, baseUrl }) {
      try {
        const u = new URL(url, baseUrl);
        // Block external redirects
        if (u.origin !== baseUrl) return baseUrl;
        // Avoid looping to /signup
        if (u.pathname === "/signup") return baseUrl;
        if (ALLOWED_CALLBACK_PATHS.has(u.pathname) || u.pathname === "/") {
          return u.toString();
        }

        // Respect callbackUrl if it's safe and allowed
        const cb = u.searchParams.get("callbackUrl");
        if (cb) {
          const cbu = new URL(cb, baseUrl);
          if (cbu.origin === baseUrl && ALLOWED_CALLBACK_PATHS.has(cbu.pathname)) {
            if (cbu.pathname === "/signup") return baseUrl;
            return cbu.toString();
          }
        }
      } catch {
        // fall through to baseUrl
      }
      return baseUrl;
    },

    async jwt({ token, user, trigger }) {
      // Add uid on initial sign-in
      if (user?.id) (token as any).uid = user.id;

      // On sign-in or session.update, refresh profile fields into the token
      if (user?.id || trigger === "update") {
        const uid = (user?.id as string) || (token as any).uid;
        if (uid) {
          const profile = await prisma.user.findUnique({
            where: { id: uid },
            select: {
              subscription: true,
              username: true,
              referralCode: true,
            },
          });
          if (profile) {
            (token as any).subscription = profile.subscription ?? null;
            (token as any).username = profile.username ?? null;
            (token as any).referralCode = profile.referralCode ?? null;
          }
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user && (token as any)?.uid) {
        (session.user as any).id = (token as any).uid as string;
      }
      (session.user as any).subscription = (token as any).subscription ?? null;
      (session.user as any).username = (token as any).username ?? null;
      (session.user as any).referralCode = (token as any).referralCode ?? null;
      return session;
    },
  },

  events: {
    signIn({ user, account, isNewUser }) {
      // eslint-disable-next-line no-console
      console.log("[auth] signIn", {
        uid: user?.id,
        provider: account?.provider,
        isNewUser,
      });
    },
    createUser({ user }) {
      // eslint-disable-next-line no-console
      console.log("[auth] createUser", { uid: user.id, email: user.email });
    },
    linkAccount({ user, account }) {
      // eslint-disable-next-line no-console
      console.log("[auth] linkAccount", { uid: user.id, provider: account.provider });
    },
  },
};
