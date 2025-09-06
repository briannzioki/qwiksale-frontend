// src/auth.ts
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

/** Keep this union in sync with your NextAuth module augmentation. */
export type SubscriptionTier = "FREE" | "GOLD" | "PLATINUM" | "BASIC";

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  username?: string | null;
  subscription?: SubscriptionTier | null;
}

/** Server-side session helper (typed). */
export async function auth() {
  return getServerSession(authOptions);
}
export type Session = Awaited<ReturnType<typeof auth>>;

/** Get the typed user (or null) from the current session. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  return (session?.user as SessionUser | undefined) ?? null;
}

/** Require a session; if missing, redirect to sign-in (with callback). */
export async function requireAuth(callbackUrl?: string) {
  const session = await auth();
  if (!session?.user?.id) {
    const to = callbackUrl ?? "/";
    redirect(`/signin?callbackUrl=${encodeURIComponent(to)}`);
  }
  return session;
}

/**
 * Require a user and return a strongly-typed `SessionUser`.
 * Throws via Next.js `redirect()` if no auth.
 */
export async function requireUser(callbackUrl?: string): Promise<SessionUser> {
  const session = await requireAuth(callbackUrl);
  // Narrow to our shape
  const u = session.user as SessionUser | undefined;
  if (!u?.id) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(callbackUrl ?? "/")}`);
  }
  return u!;
}
