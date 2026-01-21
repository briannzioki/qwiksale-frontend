import "server-only";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

export type AnyUser = {
  id?: string | number | null;
  email?: string | null;
  role?: string | null;
  roles?: string[] | null;
  name?: string | null;
  username?: string | null;
  image?: string | null;
  isAdmin?: boolean | null;
  isSuperAdmin?: boolean | null;
};

export type AuthedUser = AnyUser & { id: string };

export type RequireUserResult =
  | { authorized: true; user: AuthedUser }
  | { authorized: false; status: 401; reason: string };

export type RequireAdminResult =
  | { authorized: true; user: AuthedUser }
  | { authorized: false; status: 401 | 403; reason: string };

export type RequireSuperAdminResult =
  | { authorized: true; user: AuthedUser }
  | { authorized: false; status: 401 | 403; reason: string };

export type HttpError = Error & {
  status: number;
  details?: Record<string, unknown>;
};

export function isHttpError(e: unknown): e is HttpError {
  return (
    !!e &&
    typeof e === "object" &&
    "status" in e &&
    typeof (e as any).status === "number" &&
    "message" in e &&
    typeof (e as any).message === "string"
  );
}

export function httpError(
  status: number,
  message: string,
  details?: Record<string, unknown>,
): HttpError {
  const err = new Error(message) as HttpError;
  err.status = status;
  if (details) err.details = details;
  return err;
}

/* ------------------------------ env helpers ------------------------------ */

function envBool(name: string): boolean {
  const v = process.env[name];
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function isE2Eish(): boolean {
  return (
    envBool("NEXT_PUBLIC_E2E") ||
    envBool("E2E") ||
    envBool("E2E_MODE") ||
    envBool("PLAYWRIGHT") ||
    envBool("PLAYWRIGHT_TEST") ||
    envBool("PW_TEST")
  );
}

function splitList(v?: string | null) {
  return (v ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const ADMIN_ALLOW = new Set(splitList(process.env["ADMIN_EMAILS"]));
const SUPERADMIN_ALLOW = new Set(splitList(process.env["SUPERADMIN_EMAILS"]));

function roleUpper(role: unknown): string {
  return typeof role === "string" ? role.trim().toUpperCase() : "";
}

function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return s ? s : null;
}

function normalizeId(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === "undefined" || lower === "null" || lower === "nan") return null;
  return s;
}

function computeAdminFlags(input: { email?: string | null; role?: string | null }) {
  const email = normalizeEmail(input.email);
  const role = roleUpper(input.role);

  const allowSuper = !!email && SUPERADMIN_ALLOW.has(email);
  const allowAdmin = !!email && (ADMIN_ALLOW.has(email) || allowSuper);

  const isSuperAdmin = role === "SUPERADMIN" || allowSuper;
  const isAdmin = isSuperAdmin || role === "ADMIN" || allowAdmin;

  return { isAdmin, isSuperAdmin };
}

/* ----------------------------- auth/session ------------------------------ */

async function safeAuth() {
  try {
    return await auth();
  } catch {
    return null;
  }
}

function normalize(raw: any): AnyUser | null {
  if (!raw) return null;

  const out: AnyUser = { ...raw };

  if (out.id !== undefined && out.id !== null) out.id = String(out.id).trim();
  if (typeof out.email === "string") out.email = out.email.trim().toLowerCase();
  if (typeof out.role === "string") out.role = out.role.trim();
  if (typeof out.username === "string") out.username = out.username.trim();
  if (typeof out.name === "string") out.name = out.name.trim();

  // Empty-string -> null-ish
  if (typeof out.id === "string" && !out.id) out.id = null;
  if (typeof out.email === "string" && !out.email) out.email = null;

  return out;
}

type DbUserRow = {
  id: unknown;
  email: unknown;
  role: unknown;
  name: unknown;
  username: unknown;
  image: unknown;
};

async function findDbUserForAuthz(input: {
  id?: string | null;
  email?: string | null;
}): Promise<DbUserRow | null> {
  const id = normalizeId(input.id);
  const email = normalizeEmail(input.email);

  if (!id && !email) return null;

  try {
    if (id) {
      const byId = (await prisma.user
        .findUnique({
          where: { id },
          select: {
            id: true,
            email: true,
            role: true,
            name: true,
            username: true,
            image: true,
          },
        })
        .catch(() => null)) as any;
      if (byId?.id != null) return byId as DbUserRow;
    }

    if (email) {
      const byEmail = (await prisma.user
        .findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            role: true,
            name: true,
            username: true,
            image: true,
          },
        })
        .catch(() => null)) as any;
      if (byEmail?.id != null) return byEmail as DbUserRow;
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * For admin checks, treat session claims as UNTRUSTED.
 * We decide admin-ness from:
 * 1) allowlists (ADMIN_EMAILS / SUPERADMIN_EMAILS)
 * 2) DB role (User.role)
 *
 * E2E guardrail:
 * - In non-production, force the configured E2E_USER_EMAIL to behave as NON-ADMIN for server guards.
 *   This prevents "admin-ish" test users from breaking admin guardrail specs.
 */
async function resolveAdminFromDbOrAllowlist(u: AnyUser | null): Promise<{
  isAdmin: boolean;
  isSuperAdmin: boolean;
  dbRole: string | null;
  dbEmail: string | null;
  dbId: string | null;
}> {
  const emailFromSession = normalizeEmail(u?.email ?? null);
  const idFromSession = normalizeId(u?.id ?? null);

  // ✅ E2E override: do NOT depend on special Playwright env flags.
  // We scope to non-production, and only to the single configured E2E_USER_EMAIL.
  const e2eUserEmail = normalizeEmail(process.env["E2E_USER_EMAIL"] ?? null);
  if (process.env.NODE_ENV !== "production" && e2eUserEmail) {
    if (emailFromSession && emailFromSession === e2eUserEmail) {
      return {
        isAdmin: false,
        isSuperAdmin: false,
        dbRole: null,
        dbEmail: emailFromSession,
        dbId: idFromSession,
      };
    }

    // If session email is missing, try to resolve it by id once (still scoped to non-prod).
    if (!emailFromSession && idFromSession) {
      const row = await findDbUserForAuthz({ id: idFromSession, email: null });
      const dbEmail = normalizeEmail(row?.email ?? null);
      if (dbEmail && dbEmail === e2eUserEmail) {
        return {
          isAdmin: false,
          isSuperAdmin: false,
          dbRole: row?.role != null ? roleUpper(row.role) : null,
          dbEmail,
          dbId: idFromSession,
        };
      }
    }
  }

  // Fast path: allowlists win (no DB needed).
  const allowSuper = !!emailFromSession && SUPERADMIN_ALLOW.has(emailFromSession);
  const allowAdmin = !!emailFromSession && (ADMIN_ALLOW.has(emailFromSession) || allowSuper);

  if (allowSuper || allowAdmin) {
    return {
      isAdmin: true,
      isSuperAdmin: allowSuper,
      dbRole: null,
      dbEmail: emailFromSession,
      dbId: idFromSession,
    };
  }

  // DB role check (source of truth).
  const row = await findDbUserForAuthz({ id: idFromSession, email: emailFromSession });
  const dbId = row?.id != null ? normalizeId(row.id) : null;
  const dbEmail = row?.email != null ? normalizeEmail(row.email) : null;
  const dbRole = row?.role != null ? roleUpper(row.role) : null;

  const flags = computeAdminFlags({
    email: dbEmail ?? emailFromSession,
    role: dbRole,
  });

  return {
    isAdmin: flags.isAdmin,
    isSuperAdmin: flags.isSuperAdmin,
    dbRole: dbRole || null,
    dbEmail: dbEmail ?? emailFromSession,
    dbId: dbId ?? idFromSession,
  };
}

async function reconcileUserAgainstDb(u: AnyUser): Promise<AnyUser> {
  if (!u) return u;

  const email = normalizeEmail(u.email);
  if (!email) return u;

  const id = normalizeId(u.id) ?? "";

  const shouldReconcile =
    !id || id === "undefined" || id === "null" || isE2Eish() || process.env.NODE_ENV !== "production";

  if (!shouldReconcile) return u;

  try {
    const row = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        role: true,
        image: true,
      },
    });

    if (!row?.id) return u;

    const dbId = normalizeId((row as any).id);
    if (!dbId) return u;

    const merged: AnyUser = { ...u };

    // ✅ critical: ensure id matches DB owner for this email
    merged.id = dbId;

    // ✅ prefer DB as source of truth for authz-sensitive fields in dev/E2E
    if (typeof row.email === "string") merged.email = row.email.trim().toLowerCase();

    if (typeof row.role === "string" && row.role.trim()) {
      merged.role = row.role.trim();
    }

    // Avoid privilege drift from stale session payloads (roles arrays etc.)
    merged.roles = null;

    if (!merged.name && typeof row.name === "string") merged.name = row.name;
    if (!merged.username && typeof (row as any).username === "string") {
      merged.username = (row as any).username;
    }
    if (!merged.image && typeof row.image === "string") merged.image = row.image;

    const flags = computeAdminFlags({
      email: merged.email ?? email,
      role:
        typeof merged.role === "string"
          ? merged.role
          : typeof row.role === "string"
            ? row.role
            : null,
    });

    merged.isAdmin = flags.isAdmin;
    merged.isSuperAdmin = flags.isSuperAdmin;

    return merged;
  } catch {
    return u;
  }
}

/**
 * Get the current session user, normalized to a consistent shape.
 * - Ensures id is a string when present.
 * - Never throws (treats failures as unauthenticated).
 * - ✅ In E2E/dev: reconciles id/role against DB via email to avoid privilege drift.
 */
export async function getSessionUser(): Promise<AnyUser | null> {
  const session = await safeAuth();
  const raw = (session as any)?.user ?? null;
  if (!raw) return null;

  const u = normalize(raw);
  if (!u) return null;

  return await reconcileUserAgainstDb(u);
}

/** Legacy helper; keep for callers that want a quick check. */
export function isAdminUser(u: AnyUser | null | undefined): boolean {
  if (!u) return false;
  if (u.isAdmin) return true;

  const primary = String(u.role || "").toLowerCase();
  if (primary === "admin" || primary === "superadmin") return true;

  if (Array.isArray(u.roles)) {
    return u.roles.some((r) => {
      const rr = String(r || "").toLowerCase();
      return rr === "admin" || rr === "superadmin";
    });
  }

  return false;
}

/** Legacy helper; keep for callers that want a quick check. */
export function isSuperAdminUserLocal(u: AnyUser | null | undefined): boolean {
  if (!u) return false;
  if (u.isSuperAdmin) return true;

  const primary = String(u.role || "").toLowerCase();
  if (primary === "superadmin") return true;

  if (Array.isArray(u.roles)) {
    return u.roles.some((r) => String(r || "").toLowerCase() === "superadmin");
  }

  return false;
}

/** Async helper to check super-admin using DB/allowlist truth. */
export async function isSuperAdminUser(): Promise<boolean> {
  const u = await getSessionUser();
  const resolved = await resolveAdminFromDbOrAllowlist(u);
  return resolved.isSuperAdmin;
}

/**
 * Canonical signed-in guard used across app pages + API.
 */
export async function requireUser(opts?: { mode?: "redirect"; callbackUrl?: string }): Promise<AuthedUser>;
export async function requireUser(opts: { mode: "result"; callbackUrl?: string }): Promise<RequireUserResult>;
export async function requireUser(opts?: {
  mode?: "redirect" | "result";
  callbackUrl?: string;
}): Promise<AuthedUser | RequireUserResult> {
  const mode = opts?.mode ?? "redirect";
  const callbackUrl = opts?.callbackUrl ?? "/";

  const u = await getSessionUser();
  const id = normalizeId(u?.id) ?? "";

  if (!id) {
    if (mode === "result") {
      return { authorized: false, status: 401, reason: "Unauthenticated" };
    }
    redirect(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  return (mode === "result"
    ? { authorized: true, user: { ...(u as AnyUser), id } as AuthedUser }
    : ({ ...(u as AnyUser), id } as AuthedUser)) as any;
}

/**
 * Canonical admin guard used across the app.
 *
 * IMPORTANT:
 * - Does NOT trust session claims like user.isAdmin / user.role.
 * - Uses DB role + allowlists as the source of truth.
 */
export async function requireAdmin(opts?: {
  mode?: "redirect";
  callbackUrl?: string;
  adminFallbackHref?: string;
}): Promise<void>;
export async function requireAdmin(opts: {
  mode: "result";
  callbackUrl?: string;
  adminFallbackHref?: string;
}): Promise<RequireAdminResult>;
export async function requireAdmin(opts?: {
  mode?: "redirect" | "result";
  callbackUrl?: string;
  adminFallbackHref?: string;
}): Promise<void | RequireAdminResult> {
  const mode = opts?.mode ?? "redirect";
  const callbackUrl = opts?.callbackUrl ?? "/admin";
  const adminFallbackHref = opts?.adminFallbackHref ?? "/dashboard";

  const uRes = await requireUser({ mode: "result", callbackUrl });

  if (!uRes.authorized) {
    if (mode === "result") return { authorized: false, status: 401, reason: uRes.reason };
    redirect(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const resolved = await resolveAdminFromDbOrAllowlist(uRes.user);

  if (!resolved.isAdmin) {
    if (mode === "result") return { authorized: false, status: 403, reason: "Forbidden" };
    redirect(adminFallbackHref);
  }

  if (mode === "result") {
    const patched: AuthedUser = {
      ...uRes.user,
      ...(resolved.dbId ? { id: resolved.dbId } : {}),
      ...(resolved.dbEmail ? { email: resolved.dbEmail } : {}),
      ...(resolved.dbRole ? { role: resolved.dbRole } : {}),
      isAdmin: true,
      isSuperAdmin: resolved.isSuperAdmin,
      roles: null,
    };
    return { authorized: true, user: patched };
  }
}

/**
 * Super-admin guard.
 *
 * IMPORTANT:
 * - Does NOT trust session claims.
 * - Uses DB role + allowlists as the source of truth.
 */
export async function requireSuperAdmin(opts?: {
  mode?: "redirect";
  callbackUrl?: string;
  fallbackHref?: string;
}): Promise<void>;
export async function requireSuperAdmin(opts: {
  mode: "result";
  callbackUrl?: string;
  fallbackHref?: string;
}): Promise<RequireSuperAdminResult>;
export async function requireSuperAdmin(opts?: {
  mode?: "redirect" | "result";
  callbackUrl?: string;
  fallbackHref?: string;
}): Promise<void | RequireSuperAdminResult> {
  const mode = opts?.mode ?? "redirect";
  const callbackUrl = opts?.callbackUrl ?? "/admin";
  const fallbackHref = opts?.fallbackHref ?? "/dashboard";

  const uRes = await requireUser({ mode: "result", callbackUrl });

  if (!uRes.authorized) {
    if (mode === "result") return { authorized: false, status: 401, reason: uRes.reason };
    redirect(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const resolved = await resolveAdminFromDbOrAllowlist(uRes.user);

  if (!resolved.isSuperAdmin) {
    if (mode === "result") return { authorized: false, status: 403, reason: "Forbidden" };
    redirect(fallbackHref);
  }

  if (mode === "result") {
    const patched: AuthedUser = {
      ...uRes.user,
      ...(resolved.dbId ? { id: resolved.dbId } : {}),
      ...(resolved.dbEmail ? { email: resolved.dbEmail } : {}),
      ...(resolved.dbRole ? { role: resolved.dbRole } : {}),
      isAdmin: true,
      isSuperAdmin: true,
      roles: null,
    };
    return { authorized: true, user: patched };
  }
}

/* -------------------------- carrier enforcement -------------------------- */

function toIso(v: any) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  const ms = d.getTime();
  return Number.isFinite(ms) ? d.toISOString() : null;
}

export type CarrierEnforcement = {
  isBanned: boolean;
  isSuspended: boolean;
  bannedAt: string | null;
  bannedReason: string | null;
  suspendedUntil: string | null;
};

export function carrierEnforcementFromRow(row: any, now = new Date()): CarrierEnforcement {
  const bannedAt = row?.bannedAt ? toIso(row.bannedAt) : null;
  const bannedReason = typeof row?.bannedReason === "string" ? row.bannedReason : null;

  const suspendedUntil = row?.suspendedUntil ? toIso(row.suspendedUntil) : null;

  const isBanned = !!bannedAt;

  const susMs = suspendedUntil ? new Date(suspendedUntil).getTime() : NaN;
  const nowMs = now.getTime();
  const isSuspended = Number.isFinite(susMs) ? susMs > nowMs : false;

  return { isBanned, isSuspended, bannedAt, bannedReason, suspendedUntil };
}

async function findCarrierById(prismaAny: any, carrierId: string) {
  const carrierModel = (prismaAny as any)?.carrierProfile;
  if (!carrierModel || typeof carrierModel.findUnique !== "function") {
    throw httpError(
      501,
      "Carrier model is not available yet. Run the Prisma migration for CarrierProfile first.",
    );
  }

  const select = {
    id: true,
    userId: true,
    bannedAt: true,
    bannedReason: true,
    suspendedUntil: true,
  };

  try {
    return await carrierModel.findUnique({ where: { id: carrierId }, select });
  } catch {
    if (typeof carrierModel.findFirst === "function") {
      return await carrierModel.findFirst({ where: { id: carrierId }, select });
    }
    return null;
  }
}

export async function getCarrierOwnerUserIdByCarrierId(prismaAny: any, carrierId: string) {
  const carrierModel = (prismaAny as any)?.carrierProfile;
  if (!carrierModel || typeof carrierModel.findUnique !== "function") {
    throw httpError(
      501,
      "Carrier model is not available yet. Run the Prisma migration for CarrierProfile first.",
    );
  }

  try {
    const row = await carrierModel.findUnique({
      where: { id: carrierId },
      select: { userId: true },
    });
    return typeof row?.userId === "string" ? row.userId : null;
  } catch {
    if (typeof carrierModel.findFirst === "function") {
      const row = await carrierModel.findFirst({
        where: { id: carrierId },
        select: { userId: true },
      });
      return typeof row?.userId === "string" ? row.userId : null;
    }
    return null;
  }
}

export async function ensureCarrierAssignable(prismaAny: any, carrierId: string) {
  const row = await findCarrierById(prismaAny, carrierId);
  if (!row?.id) throw httpError(400, "Invalid carrierId.");

  const enforcement = carrierEnforcementFromRow(row);

  if (enforcement.isBanned) {
    throw httpError(409, "Carrier is banned.", {
      bannedAt: enforcement.bannedAt,
      bannedReason: enforcement.bannedReason,
    });
  }

  if (enforcement.isSuspended) {
    throw httpError(409, "Carrier is suspended.", {
      suspendedUntil: enforcement.suspendedUntil,
    });
  }

  return { carrierId: String(row.id), userId: String(row.userId), enforcement };
}

export async function getCarrierProfileByUserId(prismaAny: any, userId: string) {
  const carrierModel = (prismaAny as any)?.carrierProfile;
  if (!carrierModel || typeof carrierModel.findUnique !== "function") {
    return null;
  }

  const select = {
    id: true,
    bannedAt: true,
    bannedReason: true,
    suspendedUntil: true,
  };

  try {
    return await carrierModel.findUnique({ where: { userId }, select });
  } catch {
    if (typeof carrierModel.findFirst === "function") {
      return await carrierModel.findFirst({ where: { userId }, select });
    }
    return null;
  }
}
