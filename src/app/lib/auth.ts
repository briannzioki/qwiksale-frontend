import "server-only";
import { auth } from "@/auth";

export type Session = Awaited<ReturnType<typeof auth>>;
export type SessionUser =
  (NonNullable<Session>["user"] & {
    id?: string;
    role?: string | null;
    subscription?: string | null;
    isAdmin?: boolean;
    isSuperAdmin?: boolean;
  }) | null;

function splitList(v?: string | null) {
  return (v ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

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

export async function safeAuth(): Promise<Session | null> {
  try {
    return await auth();
  } catch {
    return null;
  }
}

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
    u?.isSuperAdmin === true || roleU === "SUPERADMIN" || isSuperAdminEmail(email);
  const isAdmin =
    u?.isAdmin === true || isSuperAdmin || roleU === "ADMIN" || isAdminEmail(email);

  return { session, id, email, role, isAdmin, isSuperAdmin };
}

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

export { auth };
