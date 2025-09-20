// src/auth.ts
import "server-only";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export type SubscriptionTier = "FREE" | "GOLD" | "PLATINUM" | "BASIC";

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  username?: string | null;
  subscription?: SubscriptionTier | null;
}

/** Canonical server-side session fetcher. Returns `Session | null`. */
export async function auth() {
  return getServerSession(authOptions);
}
export type Session = Awaited<ReturnType<typeof auth>>;

/** Get the typed `session.user` or `null`. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const s = await auth();
  return (s?.user as SessionUser | undefined) ?? null;
}

/**
 * Require a session; if missing, redirect to sign-in (with callback).
 * After the redirect guard, we assert the session is non-null for TS.
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
 * (We still keep a defensive check, but TS already knows from `requireAuth`.)
 */
export async function requireUser(callbackUrl?: string): Promise<SessionUser> {
  const s = await requireAuth(callbackUrl);
  const u = s.user as SessionUser | undefined;
  if (!u?.id) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(callbackUrl ?? "/")}`);
  }
  return u as SessionUser;
}
