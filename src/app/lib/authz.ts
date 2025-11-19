// src/app/lib/authz.ts
import "server-only";
import { redirect } from "next/navigation";
import { auth as _auth } from "@/auth";

export type AnyUser = {
  id?: string | number | null;
  email?: string | null;
  role?: string | null;
  roles?: string[] | null;
  isAdmin?: boolean | null;
  isSuperAdmin?: boolean | null;
};

export type RequireAdminResult =
  | { authorized: true; user: AnyUser }
  | { authorized: false; status: 401 | 403; reason: string };

export type RequireSuperAdminResult =
  | { authorized: true; user: AnyUser }
  | { authorized: false; status: 401 | 403; reason: string };

/** Safe wrapper: never throws; returns null on failure. */
async function safeAuth(): Promise<any | null> {
  try {
    return await _auth();
  } catch {
    return null;
  }
}

/**
 * Get the current session user, normalized to a consistent shape.
 * - Ensures id is a string when present.
 * - Never throws (treats failures as unauthenticated).
 */
export async function getSessionUser(): Promise<AnyUser | null> {
  const session = await safeAuth();
  const raw = (session?.user ?? null) as AnyUser | null;
  if (!raw) return null;

  const normalized: AnyUser = { ...raw };
  if (raw.id !== undefined && raw.id !== null) {
    normalized.id = String(raw.id);
  }
  return normalized;
}

/** True if user is an admin. */
export function isAdminUser(u: AnyUser | null | undefined): boolean {
  if (!u) return false;
  if (u.isAdmin) return true;

  const primary = (u.role || "").toString().toLowerCase();
  if (primary === "admin" || primary === "superadmin") return true;

  if (Array.isArray(u.roles)) {
    if (
      u.roles.some((r) =>
        ["admin", "superadmin"].includes(String(r).toLowerCase()),
      )
    ) {
      return true;
    }
  }
  return false;
}

/** True if user is a super-admin (local check). */
export function isSuperAdminUserLocal(
  u: AnyUser | null | undefined,
): boolean {
  if (!u) return false;
  if (u.isSuperAdmin) return true;

  const primary = (u.role || "").toString().toLowerCase();
  if (primary === "superadmin") return true;

  if (Array.isArray(u.roles)) {
    if (
      u.roles.some(
        (r) => String(r).toLowerCase() === "superadmin",
      )
    ) {
      return true;
    }
  }
  return false;
}

/** Async helper to check super-admin using the current session. */
export async function isSuperAdminUser(): Promise<boolean> {
  const u = await getSessionUser();
  return isSuperAdminUserLocal(u);
}

/**
 * Canonical admin guard used across the app.
 *
 * Default: "redirect" mode (for RSC/layout/middleware):
 *  - No session    => redirect(/signin?callbackUrl=/admin)
 *  - Non-admin     => redirect(/dashboard)
 *  - Admin         => continues; returns void
 *
 * API-safe: { mode: "result" }
 *  - Never redirects; returns:
 *      - { authorized: true, user }
 *      - { authorized: false, status, reason }
 */
export async function requireAdmin(opts?: {
  mode?: "redirect" | "result";
  callbackUrl?: string;
  adminFallbackHref?: string;
}): Promise<void | RequireAdminResult> {
  const mode = opts?.mode ?? "redirect";
  const callbackUrl = opts?.callbackUrl ?? "/admin";
  const adminFallbackHref = opts?.adminFallbackHref ?? "/dashboard";

  const u = await getSessionUser();

  // Unauthenticated
  if (!u?.id) {
    if (mode === "result") {
      return { authorized: false, status: 401, reason: "Unauthenticated" };
    }
    redirect(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  // Not an admin
  if (!isAdminUser(u)) {
    if (mode === "result") {
      return { authorized: false, status: 403, reason: "Forbidden" };
    }
    redirect(adminFallbackHref);
  }

  // Authorized
  if (mode === "result") return { authorized: true, user: u };
  // redirect mode & authorized: fall through
}

/**
 * Super-admin guard.
 *
 * Default: "redirect" mode (for layouts/RSC):
 *  - No session        => redirect(/signin?callbackUrl=/admin)
 *  - Non-super-admin   => redirect(/dashboard)
 *  - Super-admin       => continues; returns void
 *
 * API-safe: { mode: "result" }
 *  - Never redirects; returns:
 *      - { authorized: true, user }
 *      - { authorized: false, status, reason }
 */
export async function requireSuperAdmin(opts?: {
  mode?: "redirect" | "result";
  callbackUrl?: string;
  fallbackHref?: string;
}): Promise<void | RequireSuperAdminResult> {
  const mode = opts?.mode ?? "redirect";
  const callbackUrl = opts?.callbackUrl ?? "/admin";
  const fallbackHref = opts?.fallbackHref ?? "/dashboard";

  const u = await getSessionUser();

  // Unauthenticated
  if (!u?.id) {
    if (mode === "result") {
      return { authorized: false, status: 401, reason: "Unauthenticated" };
    }
    redirect(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  // Not a super-admin
  if (!isSuperAdminUserLocal(u)) {
    if (mode === "result") {
      return { authorized: false, status: 403, reason: "Forbidden" };
    }
    redirect(fallbackHref);
  }

  if (mode === "result") return { authorized: true, user: u };
  // redirect mode & authorized: fall through
}
