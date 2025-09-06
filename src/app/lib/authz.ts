// src/app/lib/authz.ts
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { getServerSession, getSessionUser } from "@/app/lib/auth";

/* ------------------------------------------------------------------ */
/*                                Types                                */
/* ------------------------------------------------------------------ */

export type Role = "ADMIN" | "STAFF" | "USER" | null | undefined;

/** Optional precedence if you add more roles later */
const ROLE_RANK: Record<Exclude<Role, undefined | null>, number> = {
  ADMIN: 3,
  STAFF: 2,
  USER: 1,
};

/* ------------------------------------------------------------------ */
/*                       Admin allowlist (env-based)                   */
/* ------------------------------------------------------------------ */

/** Parse once per process boot, O(1) lookup later */
const ADMIN_EMAILS_ALLOWLIST: ReadonlySet<string> = (() => {
  const raw = process.env["ADMIN_EMAILS"] || "";
  const entries = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set(entries);
})();

/* ------------------------------------------------------------------ */
/*                       Role fetch (DB; cached per req)               */
/* ------------------------------------------------------------------ */

/**
 * Fetches the current user's role from DB (if logged in).
 * Cached per request to avoid duplicate queries within the same render.
 */
const getCurrentUserRole = cache(async (): Promise<Role> => {
  const u = await getSessionUser();
  if (!u?.id) return null;

  const row = await prisma.user.findUnique({
    where: { id: u.id as string },
    select: { role: true },
  });
  return (row?.role as Role) ?? "USER";
});

/* ------------------------------------------------------------------ */
/*                              Predicates                             */
/* ------------------------------------------------------------------ */

/** True if the logged-in user is on the env email allowlist. */
export async function isAllowlistedAdminEmail(): Promise<boolean> {
  const u = await getSessionUser();
  const email = u?.email?.toLowerCase();
  return !!(email && ADMIN_EMAILS_ALLOWLIST.has(email));
}

/** Returns true if user is considered admin (env allowlist OR DB role). */
export async function isAdminUser(): Promise<boolean> {
  if (await isAllowlistedAdminEmail()) return true;

  const role = await getCurrentUserRole();
  return role === "ADMIN";
}

/** Returns true if user has at least the required role. */
export async function hasRoleAtLeast(min: Exclude<Role, null | undefined>): Promise<boolean> {
  // Admin allowlist always grants ADMIN
  if (await isAllowlistedAdminEmail()) return true;

  const role = await getCurrentUserRole();
  if (!role) return false;
  const have = ROLE_RANK[role] ?? 0;
  const need = ROLE_RANK[min] ?? 0;
  return have >= need;
}

/* ------------------------------------------------------------------ */
/*                             Hard guards                             */
/* ------------------------------------------------------------------ */

/**
 * Redirect to sign-in if not logged in, then check admin.
 * If not admin, redirect to "/".
 */
export async function requireAdmin(orReturnTo = "/admin"): Promise<void> {
  const session = await getServerSession();
  if (!session?.user) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(orReturnTo)}`);
  }
  if (!(await isAdminUser())) {
    redirect("/"); // or a dedicated /forbidden
  }
}

/** Throw if not admin (useful in server actions / API route handlers). */
export async function assertAdminOrThrow(message = "Forbidden"): Promise<void> {
  const session = await getServerSession();
  if (!session?.user || !(await isAdminUser())) {
    throw new Error(message);
  }
}

/**
 * Generic role gate with redirect flow.
 * Example: await requireRoleOrRedirect("STAFF", "/admin");
 */
export async function requireRoleOrRedirect(
  min: Exclude<Role, null | undefined>,
  returnTo = "/"
): Promise<void> {
  const session = await getServerSession();
  if (!session?.user) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(returnTo)}`);
  }
  if (!(await hasRoleAtLeast(min))) {
    redirect("/"); // or /forbidden
  }
}

/** Generic role assertion (throws instead of redirecting). */
export async function assertRoleAtLeast(min: Exclude<Role, null | undefined>, message = "Forbidden"): Promise<void> {
  const ok = await hasRoleAtLeast(min);
  if (!ok) throw new Error(message);
}

/* ------------------------------------------------------------------ */
/*                             Utilities                               */
/* ------------------------------------------------------------------ */

/** Expose the parsed allowlist (read-only) for diagnostics/admin UI. */
export function getAdminAllowlist(): string[] {
  return Array.from(ADMIN_EMAILS_ALLOWLIST.values()).sort();
}
