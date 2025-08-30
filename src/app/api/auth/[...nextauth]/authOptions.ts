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

const isProd = process.env.NODE_ENV === "production";
const COOKIE_DOMAIN = ".qwiksale.sale"; // share across apex + subdomains

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  pages: { signIn: "/signin" },

  // JWT sessions work well on Vercel/Edge
  session: { strategy: "jwt" },

  /** 🔐 Cookies pinned to apex domain so sessions survive www → apex, etc. */
  cookies: {
    // Session cookie (httpOnly)
    sessionToken: {
      name: isProd ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
        domain: COOKIE_DOMAIN,
      },
    },
    // CSRF cookie (must be readable by client)
    csrfToken: {
      name: "next-auth.csrf-token",
      options: {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        secure: isProd,
        domain: COOKIE_DOMAIN,
      },
    },
    // Used during OAuth
    state: {
      name: "next-auth.state",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
        domain: COOKIE_DOMAIN,
      },
    },
    // PKCE verifier for OAuth
    pkceCodeVerifier: {
      name: "next-auth.pkce.code_verifier",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
        domain: COOKIE_DOMAIN,
      },
    },
    // Nonce for OpenID Connect
    nonce: {
      name: "next-auth.nonce",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
        domain: COOKIE_DOMAIN,
      },
    },
    // Where NextAuth stores/reads the intended return URL
    callbackUrl: {
      name: "next-auth.callback-url",
      options: {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        secure: isProd,
        domain: COOKIE_DOMAIN,
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

        // If user exists…
        if (existing) {
          if (!existing.passwordHash) {
            // Password not set yet → set it now
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

        // Create a new unverified account with this email + password
        const hash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
          data: {
            email,
            passwordHash: hash,
            verified: false,       // remains false until future seller verification
            emailVerified: null,   // not verified
          },
        });
        return user;
      },
    }),

    // Google OAuth (optional sign-in path)
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

        // Copy to token
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

        // Profile completeness: for now only username is required
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
  },
};

export default authOptions;
