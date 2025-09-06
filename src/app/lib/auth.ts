// src/app/lib/auth.ts

// Centralized NextAuth helpers (NextAuth v5 via src/auth.ts)
// NOTE: Your src/auth.ts does not export signIn/signOut, so we only import auth.
import { auth } from "@/auth";
import { cache } from "react";
import { redirect } from "next/navigation";

/** Re-export canonical helpers app-wide */
export { auth };

/* ------------------------------------------------------------------ */
/*                               Types                                 */
/* ------------------------------------------------------------------ */

export type SessionUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  // add any custom fields you attach in callbacks here
};

/* ------------------------------------------------------------------ */
/*                          Core session access                        */
/* ------------------------------------------------------------------ */

/**
 * Cached server session (safe for RSC & route handlers).
 * Use this to avoid duplicate `auth()` calls per request.
 */
export const getServerSession = cache(async () => {
  // NextAuth v5 `auth()` returns `Session | null`
  return auth();
});

/** Returns the `session.user` object (typed) or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const s = await getServerSession();
  return (s?.user as SessionUser) ?? null;
}

/** Returns the current user's id if present, else null. */
export async function requireUserId(): Promise<string | null> {
  const u = await getSessionUser();
  const id = (u?.id ?? null) as string | null;
  return id || null;
}

/** Boolean convenience. */
export async function isAuthenticated(): Promise<boolean> {
  return !!(await requireUserId());
}

/* ------------------------------------------------------------------ */
/*                        Guard & Redirect Helpers                     */
/* ------------------------------------------------------------------ */

/**
 * Throws if no user id is present.
 * Useful inside server actions / API routes where you want a 500 if missing.
 */
export async function requireUserIdOrThrow(message = "Unauthorized"): Promise<string> {
  const id = await requireUserId();
  if (!id) throw new Error(message);
  return id;
}

/**
 * Redirects to sign-in if not authenticated.
 * Call in RSC pages/layouts or route handlers where a redirect is desired.
 *
 * `signInPath` should point at your app's sign-in page (default "/signin").
 * If you wire a NextAuth Credentials/Providers page, keep your own page at /signin
 * and forward to the NextAuth flow from there.
 */
export async function requireAuthOrRedirect(
  signInPath = "/signin",
  // where to return after auth:
  callbackUrl?: string
): Promise<string> {
  const id = await requireUserId();
  if (id) return id;

  if (callbackUrl) {
    redirect(`${signInPath}?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  } else {
    redirect(signInPath);
  }
}

/**
 * Returns `{ id, email }` (either may be null). Handy for logging / auditing.
 */
export async function getUserIdOrEmail(): Promise<{ id: string | null; email: string | null }> {
  const s = await getServerSession();
  const u = (s?.user as SessionUser) ?? null;
  return { id: (u?.id as string) ?? null, email: u?.email ?? null };
}

/* ------------------------------------------------------------------ */
/*                           Client note                               */
/* ------------------------------------------------------------------ */
/**
 * All functions in this module are server-only. Do not import into "use client" files.
 * For clients, prefer:
 *   - `useSession()` from "next-auth/react" to read session
 *   - `signIn()` / `signOut()` from "next-auth/react" (client-only) if you need programmatic auth
 *
 * If you want server-side `signIn`/`signOut` helpers here, export them from your src/auth.ts like:
 *   export const { handlers, auth, signIn, signOut } = NextAuth({ ... })
 * Then you can re-add:
 *   import { auth, signIn, signOut } from "@/auth";
 *   export { auth, signIn, signOut };
 */
