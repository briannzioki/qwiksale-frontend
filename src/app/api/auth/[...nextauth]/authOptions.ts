// src/app/api/auth/[...nextauth]/authOptions.ts
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/app/lib/prisma";
import { normalizeKenyanPhone } from "@/app/lib/phone";
import nodemailer from "nodemailer";

/** Allow linking same email from multiple providers in dev */
const allowDangerousLinking =
  process.env.ALLOW_DANGEROUS_LINKING === "1" ||
  process.env.ALLOW_DANGEROUS_LINKING === "true";

/** From header for emails */
const emailFrom = process.env.EMAIL_FROM || "QwikSale <no-reply@qwiksale.sale>";

/** Flexible EMAIL_SERVER parsing:
 *  - JSON string {host,port,auth:{user,pass}}
 *  - full URL: smtps://user:pass@host:465
 *  - short: user:pass@host:587
 */
function getMailer() {
  const raw = (process.env.EMAIL_SERVER || "").trim();
  if (!raw) return null;
  try {
    if (raw.startsWith("{")) return nodemailer.createTransport(JSON.parse(raw));
    if (/^smtps?:\/\//i.test(raw)) return nodemailer.createTransport(raw);
    if (/^.+@.+:\d+$/i.test(raw)) return nodemailer.createTransport(`smtp://${raw}`);
    console.warn("[email] Unrecognized EMAIL_SERVER format. Skipping transport.");
    return null;
  } catch (e) {
    console.warn("[email] Invalid EMAIL_SERVER. Will log links instead. Error:", e);
    return null;
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  pages: { signIn: "/signin" },

  // Use JWT strategy (lighter, works well with edge/serverless)
  session: { strategy: "jwt" },

  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NEXTAUTH_DEBUG === "1",

  providers: [
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

    // Email magic-link (via Mailtrap or your SMTP)
    EmailProvider({
      // We'll send ourselves inside sendVerificationRequest
      server: undefined,
      from: emailFrom,
      async sendVerificationRequest({ identifier, url }) {
        const mailer = getMailer();
        if (mailer) {
          await mailer.sendMail({
            to: identifier,
            from: emailFrom,
            subject: "Your QwikSale sign-in link",
            text: `Sign in to QwikSale:\n${url}\n\nThis link expires soon.`,
            html: `<p>Sign in to <b>QwikSale</b>:</p><p><a href="${url}">${url}</a></p><p>This link expires soon.</p>`,
          });
        } else {
          console.log("[email] verify link:", url, "identifier:", identifier);
        }
      },
    }),

    // Optional: OTP credentials (email/phone + 6-digit code flow)
    CredentialsProvider({
      id: "otp",
      name: "One-time code",
      credentials: {
        identifier: { label: "Email or Kenyan phone", type: "text" },
        code: { label: "6-digit code", type: "text" },
      },
      async authorize(creds) {
        const identifierRaw = (creds?.identifier || "").trim();
        const code = (creds?.code || "").trim();
        if (!identifierRaw || code.length !== 6) return null;

        const phone = normalizeKenyanPhone(identifierRaw);
        const identifier = phone ? `tel:${phone}` : identifierRaw.toLowerCase();

        const vt = await prisma.verificationToken.findUnique({
          where: { identifier_token: { identifier, token: code } },
        });
        if (!vt || vt.expires < new Date()) return null;

        // Upsert a user by phone/email
        const user = phone
          ? await prisma.user.upsert({
              where: { phone },
              update: {},
              create: { phone, verified: true },
            })
          : await prisma.user.upsert({
              where: { email: identifier },
              update: {},
              create: { email: identifier, verified: true },
            });

        // Consume the token
        await prisma.verificationToken.delete({
          where: { identifier_token: { identifier, token: code } },
        });

        return user;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      // On sign-in, copy fresh user fields into token
      if (user) {
        (token as any).uid = user.id;
        const u = await prisma.user.findUnique({
          where: { id: user.id },
          select: { email: true, phone: true, name: true, username: true, verified: true },
        });
        token.email = u?.email ?? null;
        (token as any).phone = u?.phone ?? null;
        (token as any).name = u?.name ?? null;
        (token as any).username = u?.username ?? null;
        (token as any).verified = u?.verified ?? false;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = (token as any).uid;
        session.user.email = (token.email as string | null) || undefined;
        (session.user as any).phone = (token as any).phone ?? null;
        session.user.name = (token as any).name ?? session.user.name;
        (session.user as any).username = (token as any).username ?? null;
        (session as any).verified = (token as any).verified ?? false;
      }
      return session;
    },
  },
};

export default authOptions;
