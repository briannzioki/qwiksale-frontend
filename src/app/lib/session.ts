// src/app/lib/session.ts
import "server-only";
import { auth } from "@/auth";
import type { Session } from "next-auth";

/**
 * Simple server-only helper for getting the current session.
 * - Never throws.
 * - Returns `null` on any failure.
 */
export async function getSession(): Promise<Session | null> {
  try {
    return (await auth()) as Session;
  } catch {
    return null;
  }
}

/**
 * Convenience: returns `true` when there is any authenticated user.
 */
export async function isAuthenticated(): Promise<boolean> {
  const s = await getSession();
  return !!s?.user;
}
