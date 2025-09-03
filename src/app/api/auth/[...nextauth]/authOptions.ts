// src/app/api/auth/[...nextauth]/authOptions.ts
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * IMPORTANT:
 * We use a fully-typed PrismaClient *only in this file* for NextAuth.
 * Elsewhere we keep the lightweight client from src/app/lib/prisma.ts.
 */
declare global {
  // eslint-disable-next-line no-var
  var __PRISMA_AUTH__: PrismaClient | undefined;
}
const prismaAuth = globalThis.__PRISMA_AUTH__ ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") {
  globalThis.__PRISMA_AUTH__ = prismaAuth;
}

const allowDangerousLinking =
  process.env.ALLOW_DANGEROUS_LINKING === "1" ||
  process.env.ALLOW_DANGEROUS_LINKING === "true";

/**
 * On Vercel, NODE_ENV is "production" for both Preview and Prod.
 * Use VERCEL_ENV to decide whether to pin cookie domain.
 */
const isNodeProd = process.env.NODE_ENV === "production";
const isVercelProd = process.env.VERCEL_ENV === "production"; // "preview" | "development" | "production"
const COOKIE_DOMAIN = ".qwiksale.sale"; // apex domain for your prod site
const cookieDomain = isVercelProd ? COOKIE_DOMAIN : undefined;

export const authOptions: NextAuthOptions = {
  // ⬇️ Use the fully-typed client here
  adapter: PrismaAdapter(prismaAuth),
  pages: { signIn: "/signin" },

  session: { strategy: "jwt" },

  cookies: {
    sessionToken: {
      name: isVercelProd ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isNodeProd,
        ...(cookieDomain ? ({ domain: cookieDomain } as const) : {}),
      },
    },
    csrfToken: {
      name: "next-auth.csrf-token",
      options: {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        secure: isNodeProd,
        ...(cookieDomain ? ({ domain: cookieDomain } as const) : {}),
      },
    },
    state: {
      name: "next-auth.state",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isNodeProd,
        ...(cookieDomain ? ({ domain: cookieDomain } as const) : {}),
      },
    },
    pkceCodeVerifier: {
      name: "next-auth.pkce.code_verifier",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isNodeProd,
        ...(cookieDomain ? ({ domain: cookieDomain } as const) : {}),
      },
    },
    nonce: {
      name: "next-auth.nonce",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isNodeProd,
        ...(cookieDomain ? ({ domain: cookieDomain } as const) : {}),
      },
    },
    callbackUrl: {
      name: "next-auth.callback-url",
      options: {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        secure: isNodeProd,
        ...(cookieDomain ? ({ domain: cookieDomain } as const) : {}),
      },
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NEXTAUTH_DEBUG === "1",

  providers: [
    // Email + Password via Credentials; store hash in NextAuth Account.refresh_token
    CredentialsProvider({
      id: "credentials",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const email = (creds?.email || "").trim().toLowerCase();
        const password = (creds?.password || "").trim();
        if (!email || !password) return null;

        const user = await prismaAuth.user.findUnique({
          where: { email },
          include: { accounts: true }, // correct relation name
        });

        const hashPassword = (pwd: string) => bcrypt.hash(pwd, 10);

        if (user) {
          // Type the accounts array so the `.find` callback param isn’t implicit `any`
          const accounts = (user.accounts ?? []) as Array<{
            provider: string;
            providerAccountId: string | null;
            refresh_token: string | null;
          }>;

          const credAccount = accounts.find(
            (a) => a.provider === "credentials" && a.providerAccountId === email
          );

          if (!credAccount) {
            // Block creating a password if the account is already linked to socials,
            // unless ALLOW_DANGEROUS_LINKING is enabled.
            const hasNonCred = accounts.some((a) => a.provider !== "credentials");
            if (hasNonCred && !allowDangerousLinking) {
              throw new Error(
                "This email is already linked to a social login. Use that provider to sign in."
              );
            }
            await prismaAuth.account.create({
              data: {
                userId: user.id,
                provider: "credentials",
                providerAccountId: email,
                type: "credentials",
                refresh_token: await hashPassword(password), // store the hash here
              },
            });
          } else {
            const storedHash = credAccount.refresh_token || "";
            const ok = storedHash && (await bcrypt.compare(password, storedHash));
            if (!ok) throw new Error("Invalid email or password.");
          }

          return { id: user.id, email: user.email ?? undefined, name: user.name ?? undefined };
        }

        // Create user + credentials account
        const newUser = await prismaAuth.user.create({
          data: { email },
        });

        await prismaAuth.account.create({
          data: {
            userId: newUser.id,
            provider: "credentials",
            providerAccountId: email,
            type: "credentials",
            refresh_token: await hashPassword(password),
          },
        });

        return { id: newUser.id, email: newUser.email ?? undefined, name: newUser.name ?? undefined };
      },
    }),

    // Google OAuth
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      allowDangerousEmailAccountLinking: allowDangerousLinking,
      authorization: {
        params: {
          prompt: "select_account",
          access_type: "online",
          response_type: "code",
        },
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        (token as any).uid = (user as any).id;

        const dbUser = await prismaAuth.user.findUnique({
          where: { id: (user as any).id },
          select: {
            email: true,
            name: true,
            username: true,
            subscription: true,
            subscriptionUntil: true,
            role: true,
          },
        });

        token.email = dbUser?.email ?? null;
        (token as any).name = dbUser?.name ?? null;
        (token as any).username = dbUser?.username ?? null;
        (token as any).subscription = dbUser?.subscription ?? "BASIC";
        (token as any).subscriptionUntil = dbUser?.subscriptionUntil ?? null;
        (token as any).role = dbUser?.role ?? "USER";

        (token as any).needsProfile = !(dbUser?.username && dbUser.username.trim().length >= 3);
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = (token as any).uid;
        session.user.email = (token.email as string | null) || undefined;
        (session.user as any).name = (token as any).name ?? session.user.name;
        (session.user as any).username = (token as any).username ?? null;

        (session as any).subscription = (token as any).subscription ?? "BASIC";
        (session as any).subscriptionUntil = (token as any).subscriptionUntil ?? null;
        (session as any).role = (token as any).role ?? "USER";

        (session as any).needsProfile = (token as any).needsProfile ?? false;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        const u = new URL(url);
        if (u.origin === baseUrl) return url;
      } catch {}
      return baseUrl;
    },
  },
};

export default authOptions;
