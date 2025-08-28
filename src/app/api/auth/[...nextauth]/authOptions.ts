import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/app/lib/prisma";
import { normalizeKenyanPhone } from "@/app/lib/phone";
import nodemailer from "nodemailer";

const allowDangerousLinking =
  process.env.ALLOW_DANGEROUS_LINKING === "1" ||
  process.env.ALLOW_DANGEROUS_LINKING === "true";

const emailFrom = process.env.EMAIL_FROM || "no-reply@qwiksale.local";
const smtpUrl = process.env.EMAIL_SERVER || ""; // optional

const mailer = smtpUrl ? nodemailer.createTransport(smtpUrl) : null;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  pages: { signIn: "/signin" },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NEXTAUTH_DEBUG === "1",

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      allowDangerousEmailAccountLinking: allowDangerousLinking,
    }),

    EmailProvider({
      server: smtpUrl || undefined,
      from: emailFrom,
      async sendVerificationRequest({ identifier, url, provider }) {
        if (!mailer) {
          console.log("[email] verify link:", url, "identifier:", identifier);
          return;
        }
        await mailer.sendMail({
          to: identifier,
          from: provider.from,
          subject: "Your QwikSale sign-in link",
          text: `Sign in to QwikSale:\n${url}\n\nThis link expires soon.`,
          html: `<p>Sign in to <b>QwikSale</b>:</p><p><a href="${url}">${url}</a></p><p>This link expires soon.</p>`,
        });
      },
    }),

    // NOTE: This is still available for "sign in by phone" if you want it,
    // but we DO NOT use it for phone verification on the profile page.
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

        // Sign them in (creates/returns a user account keyed by phone/email)
        let user;
        if (phone) {
          user = await prisma.user.upsert({
            where: { phone },
            update: {},
            create: { phone, verified: true },
          });
        } else {
          user = await prisma.user.upsert({
            where: { email: identifier },
            update: {},
            create: { email: identifier, verified: true },
          });
        }

        await prisma.verificationToken.delete({
          where: { identifier_token: { identifier, token: code } },
        });

        return user;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
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
        (session.user as any).id = token.uid;
        session.user.email = (token.email as string | null) || undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).phone = (token as any).phone ?? null;
        session.user.name = (token as any).name ?? session.user.name;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).username = (token as any).username ?? null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session as any).verified = (token as any).verified ?? false;
      }
      return session;
    },
  },
};

export default authOptions;
