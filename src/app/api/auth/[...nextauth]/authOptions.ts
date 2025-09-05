// src/app/api/auth/[...nextauth]/authOptions.ts
import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/server/db"; // or "@/app/lib/prisma" if that's your setup
import Credentials from "next-auth/providers/credentials";
// import Google from "next-auth/providers/google";
import { verifyPassword } from "@/server/auth";

const isProd = process.env.NODE_ENV === "production";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },

  cookies: {
    sessionToken: {
      name: isProd ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        secure: isProd,
        ...(isProd ? { domain: ".qwiksale.sale" } : {}),
      },
    },
  },

  providers: [
    Credentials({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password ?? "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, passwordHash: true, name: true, image: true },
        });
        if (!user?.passwordHash) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name ?? null, image: user.image ?? null };
      },
    }),

    // Google (enable when ready)
    // Google({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! }),
  ],

  pages: { signIn: "/signin" },

  callbacks: {
    async jwt({ token, user }) { if (user?.id) token.uid = user.id; return token; },
    async session({ session, token }) { if (token?.uid) (session as any).uid = token.uid; return session; },
  },
};
