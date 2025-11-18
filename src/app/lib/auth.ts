// src/app/lib/auth.ts
import "server-only";
import { auth as coreAuth } from "@/auth";
import type { Session as NextAuthSession } from "next-auth";

/**
 * Re-export canonical auth helper for server code.
 * This is the single entry point for reading the NextAuth session.
 */
export const auth = coreAuth;

/** App-wide session type (nullable for convenience). */
export type Session = NextAuthSession | null;

/** User type from session; null when unauthenticated. */
export type SessionUser =
  | NonNullable<NonNullable<NextAuthSession["user"]>>
  | null;

/* ------------------------------------------------------------------ */
/* ------------------------- Small helpers --------------------------- */
/* ------------------------------------------------------------------ */

function splitList(v?: string | null) {
  return (v ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function getAdminEmailSets() {
  const admin = new Set(splitList(process.env["ADMIN_EMAILS"]));
  const superAdmin = new Set(splitList(process.env["SUPERADMIN_EMAILS"]));
  return { admin, superAdmin };
}

/* ------------------------------------------------------------------ */
/* --------------------- Admin email allowlists ---------------------- */
/* ------------------------------------------------------------------ */

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const { superAdmin } = getAdminEmailSets();
  return superAdmin.has(email.toLowerCase());
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  const { admin, superAdmin } = getAdminEmailSets();
  return admin.has(e) || superAdmin.has(e);
}

/* ------------------------------------------------------------------ */
/* --------------------------- Safe wrappers ------------------------- */
/* ------------------------------------------------------------------ */

/**
 * Safe session getter.
 * - Never throws.
 * - Returns `null` on any failure.
 */
export async function safeAuth(): Promise<Session> {
  try {
    return await auth();
  } catch {
    return null;
  }
}

/**
 * Rich viewer snapshot used by UI & logs.
 * - Normalizes id/email/role.
 * - Derives isAdmin / isSuperAdmin using the same rules as auth.config.ts.
 */
export async function getViewer(): Promise<{
  session: Session;
  id?: string;
  email?: string;
  role?: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}> {
  const session = await safeAuth();
  const u = (session?.user ?? {}) as any;

  const id =
    typeof u?.id === "string"
      ? u.id
      : u?.id != null
      ? String(u.id)
      : undefined;

  const email = typeof u?.email === "string" ? u.email : undefined;

  const role = typeof u?.role === "string" ? u.role : "USER";
  const roleU = role.toUpperCase();

  const viaAllowlistAdmin = isAdminEmail(email);
  const viaAllowlistSuper = isSuperAdminEmail(email);

  const isSuperAdmin =
    u?.isSuperAdmin === true ||
    roleU === "SUPERADMIN" ||
    viaAllowlistSuper;

  const isAdmin =
    u?.isAdmin === true ||
    isSuperAdmin ||
    roleU === "ADMIN" ||
    viaAllowlistAdmin;

  return {
    session,
    id,
    email,
    role,
    isAdmin,
    isSuperAdmin,
  };
}

/**
 * Legacy-style convenience: returns `session.user` or null.
 * Prefer `getViewer` or `getSessionUser` from authz for new code.
 */
export async function getSessionUser(): Promise<SessionUser> {
  const s = await safeAuth();
  return (s?.user as SessionUser) ?? null;
}

/**
 * Returns authenticated user id or null.
 */
export async function requireUserId(): Promise<string | null> {
  const v = await getViewer();
  return v.id ?? null;
}

/**
 * True if there is any authenticated user.
 */
export async function isAuthenticated(): Promise<boolean> {
  return (await requireUserId()) != null;
}

/** Keep default export for legacy imports (`import auth from "@/app/lib/auth"`). */
export { auth as default };
