// src/app/api/auth/[...nextauth]/authOptions.ts
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/app/lib/prisma";
import bcrypt from "bcryptjs";

const allowDangerousLinking =
  process.env.ALLOW_DANGEROUS_LINKING === "1" ||
  process.env.ALLOW_DANGEROUS_LINKING === "true";

/** 
 * IMPORTANT: On Vercel, NODE_ENV === "production" for both Preview and Prod.
 * We must only pin cookie `domain` on REAL production, otherwise sessions won't
 * stick on *.vercel.app previews. Use VERCEL_ENV to decide cookie domain.
 */
const isNodeProd = process.env.NODE_ENV === "production";
const isVercelProd = process.env.VERCEL_ENV === "production"; // "preview" | "development" | "production"
const COOKIE_DOMAIN = ".qwiksale.sale"; // apex domain for your prod site
const cookieDomain = isVercelProd ? COOKIE_DOMAIN : undefined;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  pages: { signIn: "/signin" },

  // JWT sessions work well on Vercel/Edge
  session: { strategy: "jwt" },

  /** 🔐 Cookies:
   *  - Use secure cookie names only on real prod (works under HTTPS).
   *  - Pin cookie `domain` only on real prod. On previews/local, omit domain.
   */
  cookies: {
    sessionToken: {
      name: isVercelProd ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isNodeProd,
        ...(cookieDomain ? { domain: cookieDomain } as const : {}),
      },
    },
    csrfToken: {
      name: "next-auth.csrf-token",
      options: {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        secure: isNodeProd,
        ...(cookieDomain ? { domain: cookieDomain } as const : {}),
      },
    },
    state: {
      name: "next-auth.state",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isNodeProd,
        ...(cookieDomain ? { domain: cookieDomain } as const : {}),
      },
    },
    pkceCodeVerifier: {
      name: "next-auth.pkce.code_verifier",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isNodeProd,
        ...(cookieDomain ? { domain: cookieDomain } as const : {}),
      },
    },
    nonce: {
      name: "next-auth.nonce",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isNodeProd,
        ...(cookieDomain ? { domain: cookieDomain } as const : {}),
      },
    },
    callbackUrl: {
      name: "next-auth.callback-url",
      options: {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        secure: isNodeProd,
        ...(cookieDomain ? { domain: cookieDomain } as const : {}),
      },
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NEXTAUTH_DEBUG === "1",

  providers: [
    // Email + Password (creates account if it doesn't exist)
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

        const existing = await prisma.user.findUnique({
          where: { email },
          include: { Account: true },
        });

        if (existing) {
          if (!existing.passwordHash) {
            const hash = await bcrypt.hash(password, 10);
            const updated = await prisma.user.update({
              where: { id: existing.id },
              data: { passwordHash: hash },
            });
            return updated;
          }
          const ok = await bcrypt.compare(password, existing.passwordHash);
          if (!ok) throw new Error("Invalid email or password.");
          return existing;
        }

        // Create unverified account
        const hash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
          data: {
            email,
            passwordHash: hash,
            verified: false,
            emailVerified: null,
          },
        });
        return user;
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
        (token as any).uid = user.id;
        const u = await prisma.user.findUnique({
          where: { id: user.id },
          select: {
            email: true,
            phone: true,
            name: true,
            username: true,
            verified: true,
            whatsapp: true,
            address: true,
            postalCode: true,
            city: true,
            country: true,
          },
        });

        token.email = u?.email ?? null;
        (token as any).phone = u?.phone ?? null;
        (token as any).name = u?.name ?? null;
        (token as any).username = u?.username ?? null;
        (token as any).verified = u?.verified ?? false;
        (token as any).whatsapp = u?.whatsapp ?? null;
        (token as any).address = u?.address ?? null;
        (token as any).postalCode = u?.postalCode ?? null;
        (token as any).city = u?.city ?? null;
        (token as any).country = u?.country ?? null;

        // mark incomplete if no username yet
        (token as any).needsProfile = !(u?.username && u.username.trim().length >= 3);
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = (token as any).uid;
        session.user.email = (token.email as string | null) || undefined;
        (session.user as any).phone = (token as any).phone ?? null;
        (session.user as any).name = (token as any).name ?? session.user.name;
        (session.user as any).username = (token as any).username ?? null;

        (session as any).verified = (token as any).verified ?? false;
        (session as any).whatsapp = (token as any).whatsapp ?? null;
        (session as any).address = (token as any).address ?? null;
        (session as any).postalCode = (token as any).postalCode ?? null;
        (session as any).city = (token as any).city ?? null;
        (session as any).country = (token as any).country ?? null;

        (session as any).needsProfile = (token as any).needsProfile ?? false;
      }
      return session;
    },

    // keep relative callbackUrls on the same origin
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
