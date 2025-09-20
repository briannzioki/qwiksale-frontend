import "server-only";
import { cache } from "react";
import { auth } from "@/auth";

export { auth };

export type Session = Awaited<ReturnType<typeof auth>>;
export type SessionUser = NonNullable<Session>["user"] & { id?: string };

// Cached per request to avoid duplicate session work
export const getServerSession = cache(async () => auth());

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
