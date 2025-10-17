// src/auth.ts
import "server-only";

import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

/**
 * Keep TS in sync with Prisma:
 * - DB stores "FREE" but the app uses "BASIC" (via @map in Prisma).
 */
export type SubscriptionTier = "BASIC" | "GOLD" | "PLATINUM";
export type Role = "USER" | "MODERATOR" | "ADMIN";

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  username?: string | null;
  subscription?: SubscriptionTier | null;
  role?: Role | null;
  /** True if email is in ADMIN_EMAILS or role === ADMIN */
  isAdmin?: boolean;
}

/**
 * Canonical server-side session fetcher.
 * Wrapped in `cache()` so multiple calls in the same request only hit NextAuth once.
 */
export const auth = cache(async () => {
  const session = await getServerSession(authOptions);

  // Derive isAdmin: prefer role from session, otherwise derive from ADMIN_EMAILS list.
  const u = session?.user as SessionUser | undefined;
  if (u?.email) {
    const fromRole = u.role === "ADMIN";
    const admins = (process.env["ADMIN_EMAILS"] ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const fromList = admins.includes(u.email.toLowerCase());
    u.isAdmin = Boolean(fromRole || fromList);
  }

  return session;
});

export type Session = Awaited<ReturnType<typeof auth>>;

/** Get the typed `session.user` or `null`. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const s = await auth();
  return (s?.user as SessionUser | undefined) ?? null;
}

/** Convenience: boolean check for authentication. */
export async function isAuthenticated(): Promise<boolean> {
  return !!(await getSessionUser());
}

/** Return just the user id or null. */
export async function requireUserIdOrNull(): Promise<string | null> {
  const u = await getSessionUser();
  return u?.id ?? null;
}

/**
 * Require a session; if missing, redirect to sign-in (with callback).
 * NOTE: This assumes `authOptions` session/jwt callbacks include `user.id`.
 */
export async function requireAuth(
  callbackUrl?: string
): Promise<NonNullable<Session>> {
  const s = await auth();
  if (!s?.user?.id) {
    const to = callbackUrl ?? "/";
    redirect(`/signin?callbackUrl=${encodeURIComponent(to)}`);
  }
  return s as NonNullable<Session>;
}

/**
 * Require a user and return a strongly-typed `SessionUser`.
 */
export async function requireUser(callbackUrl?: string): Promise<SessionUser> {
  const s = await requireAuth(callbackUrl);
  const u = s.user as SessionUser | undefined;
  if (!u?.id) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(callbackUrl ?? "/")}`);
  }
  return u as SessionUser;
}

/* -------------------- Runtime sanity (non-fatal) -------------------- */
(() => {
  if (process.env.NODE_ENV !== "production") {
    const url = process.env.NEXTAUTH_URL;
    if (!url) {
      // eslint-disable-next-line no-console
      console.warn(
        "[auth] NEXTAUTH_URL is not set. Set it in .env for consistent callbacks (e.g. http://localhost:3000)."
      );
    }
  }
})();
