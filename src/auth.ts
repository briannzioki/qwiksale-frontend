// src/auth.ts
import "server-only";

import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { redirectIfDifferent } from "@/app/lib/safeRedirect";

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

/** Best-effort current href from request context (path + query). */
async function getCurrentHref(): Promise<string | null> {
  try {
    const h = await headers();

    const path =
      h.get("x-invoke-path") ||
      h.get("x-matched-path") ||
      h.get("next-url") ||
      h.get("x-next-url") ||
      ""; // e.g. "/signin"

    const rawQuery =
      h.get("x-invoke-query") ||
      h.get("x-query") ||
      ""; // e.g. "callbackUrl=%2Fdashboard"

    if (!path) return null;
    const qs = rawQuery ? (rawQuery.startsWith("?") ? rawQuery : `?${rawQuery}`) : "";
    return `${path}${qs}`;
  } catch {
    return null;
  }
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
 * Uses a "safe redirect" that NO-OPs when already on the same /signin URL.
 */
export async function requireAuth(callbackUrl?: string): Promise<NonNullable<Session>> {
  const s = await auth();
  if (!s?.user?.id) {
    const to = callbackUrl ?? "/";
    const target = `/signin?callbackUrl=${encodeURIComponent(to)}`;
    const current = await getCurrentHref();

    if (current) {
      // Throws if different; no-ops if identical (prevents /signin ↔ /signin loops)
      redirectIfDifferent(target, current);
    } else {
      // Fallback when we cannot read current path/query
      redirect(target);
    }
  }
  return s as NonNullable<Session>;
}

/**
 * Require a user and return a strongly-typed `SessionUser`.
 * Same safe-redirect behavior as requireAuth().
 */
export async function requireUser(callbackUrl?: string): Promise<SessionUser> {
  const s = await requireAuth(callbackUrl);
  const u = s.user as SessionUser | undefined;
  if (!u?.id) {
    const to = callbackUrl ?? "/";
    const target = `/signin?callbackUrl=${encodeURIComponent(to)}`;
    const current = await getCurrentHref();

    if (current) {
      redirectIfDifferent(target, current);
    } else {
      redirect(target);
    }
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
