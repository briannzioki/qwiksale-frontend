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
    isSuperAdmin?: boolean;
  }) | null;

/* ----------------------- Allowlist helpers (env) ----------------------- */

function splitList(v?: string | null) {
  return (v ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Emails that grant admin; superadmins imply admin as well */
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  const admin = new Set(splitList(process.env["ADMIN_EMAILS"]));
  const superAdmin = new Set(splitList(process.env["SUPERADMIN_EMAILS"]));
  return admin.has(e) || superAdmin.has(e);
}

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  const superAdmin = new Set(splitList(process.env["SUPERADMIN_EMAILS"]));
  return superAdmin.has(e);
}

/* --------------------- Safe session wrappers (server) -------------------- */

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
 *   - role === "ADMIN" | "SUPERADMIN", OR
 *   - email is in ADMIN_EMAILS/SUPERADMIN_EMAILS allow-lists
 * - `isSuperAdmin` mirrors the SUPERADMIN checks
 */
export async function getViewer(): Promise<{
  session: Session | null;
  id?: string;
  email?: string;
  role?: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}> {
  const session = await safeAuth();
  const u = (session?.user ?? {}) as any;

  const id = typeof u?.id === "string" ? u.id : undefined;
  const email = typeof u?.email === "string" ? u.email : undefined;
  const role = typeof u?.role === "string" ? u.role : undefined;
  const roleU = role?.toUpperCase?.();

  const isSuperAdmin =
    u?.isSuperAdmin === true ||
    roleU === "SUPERADMIN" ||
    isSuperAdminEmail(email);

  const isAdmin =
    u?.isAdmin === true ||
    isSuperAdmin ||
    roleU === "ADMIN" ||
    isAdminEmail(email);

  return { session, id, email, role, isAdmin, isSuperAdmin };
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
