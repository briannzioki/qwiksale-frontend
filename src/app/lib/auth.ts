// src/app/lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import { getServerSession as _getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/app/lib/prisma";

// ---- ENV GUARDS ------------------------------------------------------------
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  // Fail fast in dev; in prod this would cause auth to be broken anyway.
  // You can switch to console.warn if you prefer a soft failure.
  console.error(
    "[auth] Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET. " +
      "Set them in your .env(.local) to enable Google login."
  );
}

// ---- AUTH OPTIONS ----------------------------------------------------------
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    GoogleProvider({
      clientId: GOOGLE_CLIENT_ID ?? "missing",
      clientSecret: GOOGLE_CLIENT_SECRET ?? "missing",
      // Improve the OAuth UX a bit
      authorization: {
        params: {
          prompt: "select_account",
          // access_type/response_type mainly relevant if you later need refresh tokens
          access_type: "online",
          response_type: "code",
        },
      },
    }),
  ],

  // You’re using Prisma Session model → database strategy is correct
  session: {
    strategy: "database",
    // Reasonable lifetimes; tweak to your needs
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // refresh session every 24h
  },

  // If you add a custom sign-in page, uncomment the line below
  // pages: { signIn: "/signin" },

  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        // mirror essential fields into the session object for client-side access
        (session.user as any).id = user.id;
        (session.user as any).subscription = (user as any).subscription; // Prisma enum SubscriptionTier
      }
      return session;
    },
    // Optional hardening: restrict sign-ins to verified emails only.
    // async signIn({ user, account, profile }) {
    //   // Example: only allow if Google email exists
    //   return !!user?.email;
    // },
  },

  // Helpful debug logs in development
  debug: process.env.NODE_ENV !== "production",
};

// Typed helper so routes can do: const session = await getServerSession();
export const getServerSession = (opts = authOptions) => _getServerSession(opts);

// Convenience: get just the current user's id (or null)
export async function getSessionUserId(): Promise<string | null> {
  const session = await getServerSession();
  const id = (session?.user as any)?.id as string | undefined;
  return id ?? null;
}

// Convenience: require a user id, returning null if unauthenticated
// (Use inside API routes to gate actions; pairs nicely with 401 handling.)
export async function requireUserId(): Promise<string | null> {
  return getSessionUserId();
}

// Some files import { authOptions, getServerSession } from this module
export { authOptions as default };

