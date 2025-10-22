// src/app/lib/authz.ts
import "server-only";
import { cache } from "react";
import { prisma } from "@/app/lib/prisma";
import { getServerSession, getSessionUser } from "@/app/lib/auth";
import { redirectIfDifferent } from "@/app/lib/safeRedirect";

export type Role = "SUPERADMIN" | "ADMIN" | "MODERATOR" | "USER" | null | undefined;

const ROLE_RANK: Record<Exclude<Role, undefined | null>, number> = {
  SUPERADMIN: 4,
  ADMIN: 3,
  MODERATOR: 2,
  USER: 1,
};

/* ----------------------- Allowlists from environment ---------------------- */

function toSet(v?: string | null) {
  return new Set(
    (v ?? "")
      .split(/[,\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

const ADMIN_EMAILS_ALLOWLIST: ReadonlySet<string> = toSet(process.env["ADMIN_EMAILS"]);
const SUPERADMIN_EMAILS_ALLOWLIST: ReadonlySet<string> = toSet(process.env["SUPERADMIN_EMAILS"]);

/* --------------------------- Role resolution ------------------------------ */

/** Prefer session flags (fast), fall back to DB role (authoritative). Cached per request. */
const getCurrentUserRole = cache(async (): Promise<Role> => {
  const u = await getSessionUser();
  if (!u?.id) return null;

  const fromSession = (u as any)?.role as Role | undefined;
  if (fromSession) return fromSession;

  const row = await prisma.user.findUnique({
    where: { id: u.id as string },
    select: { role: true },
  });
  return (row?.role as Role) ?? "USER";
});

export async function isAllowlistedAdminEmail(): Promise<boolean> {
  const u = await getSessionUser();
  const email = u?.email?.toLowerCase();
  return !!(email && (ADMIN_EMAILS_ALLOWLIST.has(email) || SUPERADMIN_EMAILS_ALLOWLIST.has(email)));
}

export async function isAllowlistedSuperAdminEmail(): Promise<boolean> {
  const u = await getSessionUser();
  const email = u?.email?.toLowerCase();
  return !!(email && SUPERADMIN_EMAILS_ALLOWLIST.has(email));
}

/** Returns both flags derived from session, allowlists, and DB role. */
export const getRoleFlags = cache(async () => {
  const u = await getSessionUser();
  const email = u?.email?.toLowerCase() ?? null;
  const role = (await getCurrentUserRole()) ?? "USER";

  const sessionIsSuper = (u as any)?.isSuperAdmin === true;
  const sessionIsAdmin = (u as any)?.isAdmin === true;

  const allowSuper = !!(email && SUPERADMIN_EMAILS_ALLOWLIST.has(email));
  const allowAdmin = !!(email && (ADMIN_EMAILS_ALLOWLIST.has(email) || SUPERADMIN_EMAILS_ALLOWLIST.has(email)));

  const isSuperAdmin = sessionIsSuper || allowSuper || role === "SUPERADMIN";
  const isAdmin = sessionIsAdmin || isSuperAdmin || role === "ADMIN";

  return { role, isAdmin, isSuperAdmin };
});

export async function isAdminUser(): Promise<boolean> {
  const { isAdmin } = await getRoleFlags();
  return isAdmin;
}

export async function isSuperAdminUser(): Promise<boolean> {
  const { isSuperAdmin } = await getRoleFlags();
  return isSuperAdmin;
}

export async function hasRoleAtLeast(min: Exclude<Role, null | undefined>) {
  const { role, isSuperAdmin, isAdmin } = await getRoleFlags();
  if (isSuperAdmin) return true;
  if (min === "ADMIN") return isAdmin;
  if (!role) return false;
  return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[min] ?? 0);
}

/* ------------------------------ Guards ----------------------------------- */

export async function requireAdmin(orReturnTo = "/admin") {
  const s = await getServerSession();
  if (!s?.user) {
    const target = `/signin?callbackUrl=${encodeURIComponent(orReturnTo)}`;
    return redirectIfDifferent(target, orReturnTo);
  }
  if (!(await isAdminUser())) {
    return redirectIfDifferent("/", orReturnTo || "/");
  }
}

export async function requireSuperAdmin(orReturnTo = "/admin") {
  const s = await getServerSession();
  if (!s?.user) {
    const target = `/signin?callbackUrl=${encodeURIComponent(orReturnTo)}`;
    return redirectIfDifferent(target, orReturnTo);
  }
  if (!(await isSuperAdminUser())) {
    return redirectIfDifferent("/", orReturnTo || "/");
  }
}

export async function assertAdminOrThrow(message = "Forbidden") {
  const s = await getServerSession();
  if (!s?.user || !(await isAdminUser())) throw new Error(message);
}

/**
 * Require a minimum role or redirect.
 * Default `returnTo` is `/signin` (non-self) to avoid accidental "/" ↔ "/" loops.
 */
export async function requireRoleOrRedirect(
  min: Exclude<Role, null | undefined>,
  returnTo = "/signin"
) {
  const s = await getServerSession();
  if (!s?.user) {
    const target = `/signin?callbackUrl=${encodeURIComponent(returnTo)}`;
    return redirectIfDifferent(target, returnTo);
  }
  if (!(await hasRoleAtLeast(min))) {
    // Compare against a non-self "current" to dodge self-redirects
    return redirectIfDifferent("/", returnTo || "/signin");
  }
}

export async function assertRoleAtLeast(min: Exclude<Role, null | undefined>, message = "Forbidden") {
  if (!(await hasRoleAtLeast(min))) throw new Error(message);
}

/* -------------------------- Diagnostics/helpers -------------------------- */

export function getAdminAllowlist(): string[] {
  return Array.from(ADMIN_EMAILS_ALLOWLIST).sort();
}
export function getSuperAdminAllowlist(): string[] {
  return Array.from(SUPERADMIN_EMAILS_ALLOWLIST).sort();
}
