// src/app/lib/auth.ts
import "server-only";
import { auth } from "@/auth";

/**
 * Types
 */
export type Session = Awaited<ReturnType<typeof auth>>;
export type SessionUser =
  (NonNullable<Session>["user"] & {
    id?: string;
    role?: string | null;
    isAdmin?: boolean;
  }) | null;

/**
 * Resolve ADMIN_EMAILS from env (comma-separated), case-insensitive.
 * Example: ADMIN_EMAILS="alice@example.com, bob@site.io"
 */
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const raw = process.env["ADMIN_EMAILS"] ?? "";
  if (!raw) return false;
  const list = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/**
 * Safe wrapper around NextAuth's auth() that never throws.
 * Returns null if auth provider misconfigures or errors.
 */
export async function safeAuth(): Promise<Session | null> {
  try {
    return await auth();
  } catch {
    return null;
  }
}

/**
 * Get the current viewer with useful flags precomputed.
 * - Never throws
 * - `isAdmin` true when:
 *   - session.user.isAdmin === true, OR
 *   - role === "ADMIN" (case-insensitive), OR
 *   - email is in ADMIN_EMAILS allow-list
 */
export async function getViewer(): Promise<{
  session: Session | null;
  id?: string;
  email?: string;
  role?: string;
  isAdmin: boolean;
}> {
  const session = await safeAuth();
  const u = (session?.user ?? {}) as any;

  const id = typeof u?.id === "string" ? u.id : undefined;
  const email = typeof u?.email === "string" ? u.email : undefined;
  const role = typeof u?.role === "string" ? u.role : undefined;

  const flag =
    u?.isAdmin === true ||
    (role?.toUpperCase?.() === "ADMIN") ||
    isAdminEmail(email);

  return { session, id, email, role, isAdmin: Boolean(flag) };
}

/**
 * Back-compat convenience: same shape you already used elsewhere.
 */
export async function getServerSession(): Promise<Session | null> {
  return safeAuth();
}

export async function getSessionUser(): Promise<SessionUser> {
  const s = await safeAuth();
  return (s?.user as SessionUser) ?? null;
}

export async function requireUserId(): Promise<string | null> {
  const v = await getViewer();
  return v.id ?? null;
}

export async function isAuthenticated(): Promise<boolean> {
  return (await requireUserId()) != null;
}

// Re-export for places that import { auth } from "@/app/lib/auth"
export { auth };
