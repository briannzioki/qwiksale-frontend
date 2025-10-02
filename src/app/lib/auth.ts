// src/app/lib/auth.ts
import "server-only";
import { auth } from "@/auth";

export { auth };

export type Session = Awaited<ReturnType<typeof auth>>;
export type SessionUser = NonNullable<Session>["user"] & { id?: string };

// Always resolve per-request. Do NOT memoize with react/cache.
export async function getServerSession(): Promise<Session> {
  return auth();
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const s = await getServerSession();
  return (s?.user as SessionUser) ?? null;
}

export async function requireUserId(): Promise<string | null> {
  const u = await getSessionUser();
  return (u?.id as string | undefined) ?? null;
}

export async function isAuthenticated(): Promise<boolean> {
  return !!(await requireUserId());
}
