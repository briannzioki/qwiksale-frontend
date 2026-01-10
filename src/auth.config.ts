// src/auth.config.ts
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/app/lib/prisma";
import { verifyPassword } from "@/app/lib/password";
import { authCookies } from "@/app/lib/auth-cookies";

function splitList(v?: string | null) {
  return (v ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function getAdminEmailSets() {
  const admin = new Set(splitList(process.env["ADMIN_EMAILS"]));
  const superAdmin = new Set(splitList(process.env["SUPERADMIN_EMAILS"]));
  return { admin, superAdmin };
}

function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const { superAdmin } = getAdminEmailSets();
  return superAdmin.has(email.toLowerCase());
}

function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  const { admin, superAdmin } = getAdminEmailSets();
  return admin.has(e) || superAdmin.has(e);
}

function normalizeIdentifier(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function safeRole(v: unknown): "USER" | "MODERATOR" | "ADMIN" | "SUPERADMIN" {
  const r = String(v || "USER").trim().toUpperCase();
  if (r === "SUPERADMIN") return "SUPERADMIN";
  if (r === "ADMIN") return "ADMIN";
  if (r === "MODERATOR") return "MODERATOR";
  return "USER";
}

function cleanUsername(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/^@+/, "");
  if (!s) return null;
  if (!/^[a-z0-9._-]{2,64}$/i.test(s)) return null;
  return s;
}

function toIsoOrNull(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  if (typeof v === "string") return v.trim() ? v.trim() : null;
  try {
    const d = new Date(String(v));
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  } catch {
    return null;
  }
}

function isE2Eish(): boolean {
  const flags = [
    process.env["NEXT_PUBLIC_E2E"],
    process.env["E2E_MODE"],
    process.env["E2E"],
    process.env["PLAYWRIGHT"],
    process.env["PLAYWRIGHT_TEST"],
  ];
  return flags.some((v) => {
    const s = String(v || "").trim().toLowerCase();
    return s === "1" || s === "true";
  });
}

function parseSecretList(raw: string): string | string[] {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : parts[0]!;
}

function getAuthSecret(): string | string[] {
  const raw = process.env["AUTH_SECRET"] || process.env["NEXTAUTH_SECRET"];
  const v = typeof raw === "string" ? raw.trim() : "";

  if (v) return parseSecretList(v);

  if (isE2Eish()) return "e2e-auth-secret";
  if (process.env.NODE_ENV !== "production") return "dev-auth-secret";

  throw new Error(
    "Missing AUTH_SECRET (or NEXTAUTH_SECRET). Set it in production to enable stable sessions.",
  );
}

function getGoogleClientId(): string | undefined {
  const v =
    process.env["GOOGLE_CLIENT_ID"] ||
    process.env["AUTH_GOOGLE_ID"] ||
    process.env["NEXT_PUBLIC_GOOGLE_CLIENT_ID"];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function getGoogleClientSecret(): string | undefined {
  const v = process.env["GOOGLE_CLIENT_SECRET"] || process.env["AUTH_GOOGLE_SECRET"];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function googleProviderOrNull() {
  const isProd = process.env.NODE_ENV === "production";
  const id = getGoogleClientId();
  const secret = getGoogleClientSecret();

  if (isProd) {
    if (!id || !secret) return null;
    return Google({ clientId: id, clientSecret: secret });
  }

  const fallbackId = id || (isE2Eish() ? "e2e-google-client-id" : "dev-google-client-id");
  const fallbackSecret =
    secret || (isE2Eish() ? "e2e-google-client-secret" : "dev-google-client-secret");

  return Google({ clientId: fallbackId, clientSecret: fallbackSecret });
}

const AUTH_SECRET = getAuthSecret();
const GOOGLE_PROVIDER = googleProviderOrNull();

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  trustHost: true,

  cookies: authCookies() as any,
  secret: AUTH_SECRET,

  pages: {
    signIn: "/signin",
    // OAuth new-user flow lands on signup (password linking UX lives there).
    newUser: "/signup?from=google",
  },

  session: {
    strategy: "jwt",
  },

  providers: [
    ...(GOOGLE_PROVIDER ? [GOOGLE_PROVIDER] : []),

    Credentials({
      name: "Credentials",
      credentials: {
        // Must match E2E + UI keys exactly
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const emailOrUsername = normalizeIdentifier(credentials?.email);
        const password = typeof credentials?.password === "string" ? credentials.password : "";

        if (!emailOrUsername || !password) return null;

        const user = await prisma.user.findFirst({
          where: {
            OR: [{ email: emailOrUsername }, { username: emailOrUsername }],
          },
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            image: true,
            role: true,
            passwordHash: true,
            banned: true,
            suspended: true,
            verified: true,
            emailVerified: true,
          },
        });

        if (!user?.id) return null;
        if (user.banned === true) return null;
        if (user.suspended === true) return null;
        if (!user.passwordHash) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : undefined;
        const username = cleanUsername(user.username ?? null) ?? undefined;

        const role = safeRole(user.role);

        const viaAllowlistAdmin = isAdminEmail(email);
        const viaAllowlistSuper = isSuperAdminEmail(email);

        const isSuperAdmin = role === "SUPERADMIN" || viaAllowlistSuper;
        const isAdmin = isSuperAdmin || role === "ADMIN" || viaAllowlistAdmin;

        const emailVerified = toIsoOrNull(user.emailVerified);

        return {
          id: String(user.id),
          ...(email ? { email } : {}),
          ...(username ? { username } : {}),
          name: user.name ?? user.username ?? undefined,
          image: user.image ?? undefined,
          role,
          isAdmin,
          isSuperAdmin,
          verified: typeof user.verified === "boolean" ? user.verified : undefined,
          ...(emailVerified ? { emailVerified } : {}),
        } as any;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (typeof token.email === "string") token.email = token.email.trim().toLowerCase();

      if (user) {
        const u: any = user;

        const uid = typeof u.id === "string" ? u.id : String(u.id ?? "");
        if (uid) token["id"] = uid;

        if (typeof u.email === "string" && u.email.trim()) {
          token.email = u.email.trim().toLowerCase();
        }

        const uname = cleanUsername(u.username);
        if (uname) token["username"] = uname;

        if (typeof u.verified === "boolean") token["verified"] = u.verified;

        const ev = toIsoOrNull(u.emailVerified);
        if (ev) token["emailVerified"] = ev;

        token.name = typeof u.name === "string" ? u.name : token.name;
        token.picture = typeof u.image === "string" ? u.image : (token.picture as any);

        const role = safeRole(u.role);
        token["role"] = role;

        const email = typeof token.email === "string" ? token.email : undefined;
        const viaAllowlistAdmin = isAdminEmail(email);
        const viaAllowlistSuper = isSuperAdminEmail(email);

        const isSuperAdmin = u.isSuperAdmin === true || role === "SUPERADMIN" || viaAllowlistSuper;
        const isAdmin = u.isAdmin === true || isSuperAdmin || role === "ADMIN" || viaAllowlistAdmin;

        token["isAdmin"] = isAdmin;
        token["isSuperAdmin"] = isSuperAdmin;
      }

      const sub = (token as any)?.sub;
      if (!token["id"] && sub) token["id"] = String(sub);

      const doReconcile = isE2Eish() || process.env.NODE_ENV !== "production";
      const email = typeof token.email === "string" ? token.email.trim().toLowerCase() : null;

      if (doReconcile && email) {
        try {
          const row = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              email: true,
              name: true,
              username: true,
              role: true,
              image: true,
              verified: true,
              emailVerified: true,
            },
          });

          const dbId =
            typeof (row as any)?.id === "string"
              ? (row as any).id.trim()
              : (row as any)?.id != null
                ? String((row as any).id).trim()
                : "";

          if (dbId && String(token["id"] || "").trim() !== dbId) {
            token["id"] = dbId;
          }

          if (typeof row?.email === "string") token.email = row.email.trim().toLowerCase();

          const uname = cleanUsername((row as any)?.username);
          if (uname) token["username"] = uname;

          if (typeof (row as any)?.verified === "boolean") token["verified"] = (row as any).verified;

          const ev = toIsoOrNull((row as any)?.emailVerified);
          if (ev) token["emailVerified"] = ev;

          if (typeof row?.name === "string" && !token.name) token.name = row.name;

          if (typeof (row as any)?.image === "string" && !token.picture) {
            token.picture = (row as any).image;
          }

          if (!token["role"]) token["role"] = safeRole((row as any)?.role);

          const role = safeRole((token as any)?.role);
          const viaAllowlistAdmin = isAdminEmail(token.email as any);
          const viaAllowlistSuper = isSuperAdminEmail(token.email as any);

          const isSuperAdmin = role === "SUPERADMIN" || viaAllowlistSuper;
          const isAdmin = isSuperAdmin || role === "ADMIN" || viaAllowlistAdmin;

          token["isAdmin"] = isAdmin;
          token["isSuperAdmin"] = isSuperAdmin;
        } catch {
          // ignore
        }
      }

      if (!token["role"]) token["role"] = "USER";
      if (typeof token["isAdmin"] !== "boolean") token["isAdmin"] = false;
      if (typeof token["isSuperAdmin"] !== "boolean") token["isSuperAdmin"] = false;
      if (typeof token["verified"] !== "boolean") token["verified"] = false;

      return token;
    },

    async session({ session, token }) {
      const s: any = session;
      const u: any = s.user ?? (s.user = {});

      const id = token?.["id"] ?? (token as any)?.sub ?? (token as any)?.uid;
      if (id) u.id = String(id);

      if (typeof token?.email === "string") u.email = token.email;
      if (typeof token?.name === "string") u.name = token.name;
      if (typeof token?.picture === "string") u.image = token.picture;

      const uname = cleanUsername((token as any)?.username);
      if (uname) u.username = uname;

      if (typeof (token as any)?.verified === "boolean") u.verified = (token as any).verified;

      if (typeof (token as any)?.emailVerified === "string") {
        u.emailVerified = (token as any).emailVerified;
        u.email_verified = (token as any).emailVerified; // back-compat
      }

      u.role = safeRole((token as any)?.role);
      u.isAdmin = (token as any)?.isAdmin === true;
      u.isSuperAdmin = (token as any)?.isSuperAdmin === true;

      return session;
    },

    async redirect({ url, baseUrl }) {
      try {
        if (url.startsWith("/")) return `${baseUrl}${url}`;

        const u = new URL(url);
        const b = new URL(baseUrl);

        if (u.origin === b.origin) return u.toString();
      } catch {
        // ignore
      }
      return baseUrl;
    },
  },

  debug: process.env.NODE_ENV !== "production" || isE2Eish(),
};

export default authConfig;
