// src/app/lib/auth.ts
import { getServerSession as _getServerSession, type Session } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export { authOptions };
export default authOptions;

// Typed helper so server routes can do: const session = await getServerSession();
export const getServerSession = (opts = authOptions) => _getServerSession(opts);

/** Return the current user's id (or null if unauthenticated). */
export async function getSessionUserId(): Promise<string | null> {
  const session: Session | null = await getServerSession();
  const id = (session?.user as { id?: string } | undefined)?.id ?? null;
  return id;
}

/** Convenience alias for guarded APIs: returns user id or null */
export async function requireUserId(): Promise<string | null> {
  return getSessionUserId();
}
