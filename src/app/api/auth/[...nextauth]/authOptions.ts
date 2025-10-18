import { createTransport } from "nodemailer";
import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import { prisma } from "@/app/lib/prisma";
import { verifyPassword, hashPassword } from "@/server/auth";

const isProd = process.env.NODE_ENV === "production";
const ALLOW_CREDS_AUTO_SIGNUP = (process.env["ALLOW_CREDS_AUTO_SIGNUP"] ?? "1") === "1";

const ALLOWED_CALLBACK_PATHS = new Set<string>([
  "/",
  "/sell",
  "/saved",
  "/account/profile",
  "/account/complete-profile",
  "/admin",
]);

/** quick helpers */
const splitList = (v?: string | null) =>
  (v ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const ADMIN_EMAILS = new Set(splitList(process.env["ADMIN_EMAILS"]));
const SUPERADMIN_EMAILS = new Set(splitList(process.env["SUPERADMIN_EMAILS"]));

function deriveHandle(email?: string | null, name?: string | null) {
  const base =
    (email?.split("@")[0] || name || "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "")
      .slice(0, 30) || null;
  return base;
}

export const authOptions: NextAuthOptions = {
  debug: process.env["NEXTAUTH_DEBUG"] === "1",
  ...(process.env["NEXTAUTH_SECRET"] ? { secret: process.env["NEXTAUTH_SECRET"]! } : {}),

  adapter: PrismaAdapter(prisma),

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },

  pages: { signIn: "/signin" },

  providers: [
    ...(process.env["EMAIL_SERVER"] && process.env["EMAIL_FROM"]
      ? [
          EmailProvider({
            server: process.env["EMAIL_SERVER"],
            from: process.env["EMAIL_FROM"],
            maxAge: 10 * 60,
            async sendVerificationRequest({ identifier, url, provider }) {
              const transport = createTransport(provider.server as any);
              const { host } = new URL(url);
              const subject = `Sign in to ${host}`;
              const text = `Sign in to ${host}\n${url}\n\nIf you did not request this email, you can ignore it.`;
              const html = `
                <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.4">
                  <h2 style="margin:0 0 12px 0">Sign in to <span style="color:#161748">${host}</span></h2>
                  <p><a href="${url}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#161748;color:#fff;text-decoration:none">Click to sign in</a></p>
                  <p style="color:#666;margin-top:12px">If you did not request this email, you can safely ignore it.</p>
                </div>`;
              await transport.sendMail({
                to: identifier,
                from: provider.from,
                replyTo: process.env["EMAIL_REPLY_TO"] || undefined,
                subject,
                text,
                html,
              });
            },
          }),
        ]
      : []),

    Credentials({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim() || "";
        const password = credentials?.password ?? "";

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
          },
        });

        if (user) {
          if (!user.passwordHash) {
            throw new Error("This email is linked to a social login. Use “Continue with Google”.");
          }
          const ok = await verifyPassword(password, user.passwordHash);
          if (!ok) {
            await new Promise((r) => setTimeout(r, 250));
            return null;
          }
          return { id: user.id, email: user.email, name: user.name ?? null, image: user.image ?? null };
        }

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

    ...(process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]
      ? [Google({ clientId: process.env["GOOGLE_CLIENT_ID"]!, clientSecret: process.env["GOOGLE_CLIENT_SECRET"]! })]
      : []),
  ],

  callbacks: {
    async redirect({ url, baseUrl }) {
      try {
        const u = new URL(url, baseUrl);
        if (u.origin !== baseUrl) return baseUrl;
        if (u.pathname === "/signup") return baseUrl;

        if (ALLOWED_CALLBACK_PATHS.has(u.pathname) || u.pathname === "/") return u.toString();

        const cb = u.searchParams.get("callbackUrl");
        if (cb) {
          const cbu = new URL(cb, baseUrl);
          if (cbu.origin === baseUrl && cbu.pathname !== "/signup" && (ALLOWED_CALLBACK_PATHS.has(cbu.pathname) || cbu.pathname === "/")) {
            return cbu.toString();
          }
        }
      } catch {}
      return baseUrl;
    },

    async jwt({ token, user, profile, trigger }) {
      // Persist id + email
      if (user?.id) (token as any).uid = user.id;
      if ((token as any).email == null && user?.email) (token as any).email = user.email;

      // First-time username derivation
      if ((token as any).username == null) {
        const fromProfile =
          (profile as any)?.preferred_username ?? (profile as any)?.login ?? null;
        (token as any).username =
          fromProfile ??
          deriveHandle(user?.email ?? null, user?.name ?? null) ??
          null;
      }

      // Sync custom claims on first login and explicit updates
      if (user?.id || trigger === "update") {
        const uid = (user?.id as string) || (token as any).uid;
        if (uid) {
          const row = await prisma.user.findUnique({
            where: { id: uid },
            select: { subscription: true, username: true, referralCode: true, role: true, email: true },
          });

          // Role from DB, with a conservative env allowlist fallback
          const email = (row?.email ?? (token as any).email ?? "").toLowerCase();
          let role = row?.role ?? "USER";
          if (SUPERADMIN_EMAILS.has(email)) role = "SUPERADMIN";
          else if (ADMIN_EMAILS.has(email) && role === "USER") role = "ADMIN";

          (token as any).subscription = row?.subscription ?? null;
          (token as any).username = row?.username ?? (token as any).username ?? null;
          (token as any).referralCode = row?.referralCode ?? null;
          (token as any).role = role;

          // Booleans the app can use without string comparisons
          (token as any).isSuperAdmin = role === "SUPERADMIN";
          (token as any).isAdmin = role === "ADMIN" || role === "SUPERADMIN";
        }
      }

      // If we still haven’t set booleans, derive from role
      if ((token as any).isAdmin == null) {
        const role = (token as any).role ?? "USER";
        (token as any).isSuperAdmin = role === "SUPERADMIN";
        (token as any).isAdmin = role === "ADMIN" || role === "SUPERADMIN";
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
      (session.user as any).role = (token as any).role ?? "USER";
      (session.user as any).isAdmin = Boolean((token as any).isAdmin);
      (session.user as any).isSuperAdmin = Boolean((token as any).isSuperAdmin);
      return session;
    },
  },

  events: {
    signIn({ user, account, isNewUser }) {
      // eslint-disable-next-line no-console
      console.log("[auth] signIn", { uid: user?.id, provider: account?.provider, isNewUser });
    },
    createUser({ user }) {
      // eslint-disable-next-line no-console
      console.log("[auth] createUser", { uid: user.id, email: (user as any).email });
    },
    linkAccount({ user, account }) {
      // eslint-disable-next-line no-console
      console.log("[auth] linkAccount", { uid: user.id, provider: account.provider });
    },
  },
};
