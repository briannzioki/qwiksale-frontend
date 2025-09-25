import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db"; // ✅ use central prisma client
import { getServerSession, getSessionUser } from "@/app/lib/auth";

export type Role = "ADMIN" | "STAFF" | "USER" | null | undefined;

const ROLE_RANK: Record<Exclude<Role, undefined | null>, number> = {
  ADMIN: 3,
  STAFF: 2,
  USER: 1,
};

// Parse allowlist once
const ADMIN_EMAILS_ALLOWLIST: ReadonlySet<string> = (() => {
  const raw = process.env["ADMIN_EMAILS"] || "";
  return new Set(
    raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  );
})();

/** Prefer session.role (fast), fall back to DB (authoritative). Cached per request. */
const getCurrentUserRole = cache(async (): Promise<Role> => {
  const u = await getSessionUser();
  if (!u?.id) return null;

  const roleFromSession = (u as any)?.role as Role | undefined;
  if (roleFromSession) return roleFromSession;

  const row = await prisma.user.findUnique({
    where: { id: u.id as string },
    select: { role: true },
  });
  return (row?.role as Role) ?? "USER";
});

export async function isAllowlistedAdminEmail(): Promise<boolean> {
  const u = await getSessionUser();
  const email = u?.email?.toLowerCase();
  return !!(email && ADMIN_EMAILS_ALLOWLIST.has(email));
}

export async function isAdminUser(): Promise<boolean> {
  if (await isAllowlistedAdminEmail()) return true;
  return (await getCurrentUserRole()) === "ADMIN";
}

export async function hasRoleAtLeast(min: Exclude<Role, null | undefined>) {
  if (await isAllowlistedAdminEmail()) return true;
  const role = await getCurrentUserRole();
  if (!role) return false;
  return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[min] ?? 0);
}

export async function requireAdmin(orReturnTo = "/admin") {
  const s = await getServerSession();
  if (!s?.user) redirect(`/signin?callbackUrl=${encodeURIComponent(orReturnTo)}`);
  if (!(await isAdminUser())) redirect("/");
}

export async function assertAdminOrThrow(message = "Forbidden") {
  const s = await getServerSession();
  if (!s?.user || !(await isAdminUser())) throw new Error(message);
}

export async function requireRoleOrRedirect(min: Exclude<Role, null | undefined>, returnTo = "/") {
  const s = await getServerSession();
  if (!s?.user) redirect(`/signin?callbackUrl=${encodeURIComponent(returnTo)}`);
  if (!(await hasRoleAtLeast(min))) redirect("/");
}

export async function assertRoleAtLeast(min: Exclude<Role, null | undefined>, message = "Forbidden") {
  if (!(await hasRoleAtLeast(min))) throw new Error(message);
}

export function getAdminAllowlist(): string[] {
  return Array.from(ADMIN_EMAILS_ALLOWLIST).sort();
}
