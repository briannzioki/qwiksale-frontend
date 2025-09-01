// src/app/lib/auth.ts

// Centralized NextAuth helpers (NextAuth v5 via src/auth.ts)
import { auth, signIn, signOut } from "@/auth";

/** Re-export the canonical helpers for app-wide use */
export { auth, signIn, signOut };

/** Backwards-compatible wrapper for legacy code that called getServerSession() */
export async function getServerSession() {
  return auth();
}

/** Convenience helper used by API routes to grab the current user's id */
export async function requireUserId(): Promise<string | null> {
  const s = await auth();
  return (s as any)?.user?.id ?? null;
}
