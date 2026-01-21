// src/app/lib/auth.server.ts
import "server-only";

import { auth } from "@/auth";

export class HttpError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;

    if (details !== undefined) {
      this.details = details;
    }

    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

export function isHttpError(err: unknown): err is HttpError {
  return !!err && typeof err === "object" && "status" in err && "code" in err;
}

function asStringOrNull(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function roleUpper(role: unknown): string {
  return typeof role === "string" ? role.trim().toUpperCase() : "";
}

function parseAllow(env?: string | null) {
  return new Set(
    (env ?? "")
      .split(/[,\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

const ADMIN_ALLOW = parseAllow(process.env["ADMIN_EMAILS"]);
const SUPERADMIN_ALLOW = parseAllow(process.env["SUPERADMIN_EMAILS"]);

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

export type AuthedUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
};

export type CarrierEnforcement = {
  isBanned: boolean;
  bannedAt: string | null;
  bannedReason: string | null;
  isSuspended: boolean;
  suspendedUntil: string | null;
};

export function computeAdminFlags(input: {
  email?: string | null;
  role?: string | null;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
}) {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : null;
  const role = roleUpper(input.role);

  // IMPORTANT: ignore session-provided booleans (untrusted); derive only from role + allowlists.
  const allowSuper = !!email && SUPERADMIN_ALLOW.has(email);
  const allowAdmin = !!email && (ADMIN_ALLOW.has(email) || allowSuper);

  const isSuperAdmin = role === "SUPERADMIN" || allowSuper;
  const isAdmin = isSuperAdmin || role === "ADMIN" || role === "SUPERADMIN" || allowAdmin;

  return { isAdmin, isSuperAdmin };
}

/**
 * ✅ Canonical: resolve the current user from session.
 * In E2E/dev or when session id is missing/garbage, reconcile by email using prisma.
 */
export async function getAuthedUser(prisma?: any): Promise<AuthedUser | null> {
  let session: any = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }

  const userAny: any = session?.user ?? null;
  if (!userAny) return null;

  const idFromSession = asStringOrNull(userAny?.id);
  const email = asStringOrNull(userAny?.email)?.toLowerCase() ?? null;

  const nameFromSession = asStringOrNull(userAny?.name) ?? null;
  const roleFromSession =
    asStringOrNull(userAny?.role) ?? asStringOrNull((session as any)?.role) ?? null;

  let userId = idFromSession;

  const shouldReconcile =
    !!prisma &&
    !!email &&
    (isE2Eish() ||
      process.env.NODE_ENV !== "production" ||
      !userId ||
      userId === "undefined" ||
      userId === "null");

  if (shouldReconcile) {
    try {
      const u = await (prisma as any).user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true, role: true, username: true },
      });

      const resolvedId = asStringOrNull(u?.id);
      if (resolvedId) userId = resolvedId;

      const resolvedEmail = asStringOrNull(u?.email)?.toLowerCase() ?? email;

      const resolvedName =
        asStringOrNull(u?.name) ??
        asStringOrNull((u as any)?.username) ??
        nameFromSession;

      const resolvedRole = asStringOrNull(u?.role) ?? roleFromSession;

      const flags = computeAdminFlags({
        email: resolvedEmail,
        role: resolvedRole,
      });

      if (!userId) return null;

      return {
        id: userId,
        email: resolvedEmail,
        name: resolvedName,
        role: resolvedRole,
        ...flags,
      };
    } catch {
      // fall through
    }
  }

  if (!userId) return null;

  const flags = computeAdminFlags({
    email,
    role: roleFromSession,
  });

  return {
    id: userId,
    email,
    name: nameFromSession,
    role: roleFromSession,
    ...flags,
  };
}

export async function requireUser(prisma?: any): Promise<AuthedUser> {
  const u = await getAuthedUser(prisma);
  if (!u?.id) {
    throw new HttpError(401, "UNAUTHORIZED", "Unauthorized");
  }
  return u;
}

export async function requireAdmin(prisma?: any): Promise<AuthedUser> {
  const u = await requireUser(prisma);
  if (!u.isAdmin) {
    throw new HttpError(403, "FORBIDDEN", "Forbidden");
  }
  return u;
}

export function carrierEnforcementFromRow(row: any, now = new Date()): CarrierEnforcement {
  const bannedAt =
    row?.bannedAt instanceof Date ? row.bannedAt : row?.bannedAt ? new Date(row.bannedAt) : null;

  const suspendedUntil =
    row?.suspendedUntil instanceof Date
      ? row.suspendedUntil
      : row?.suspendedUntil
        ? new Date(row.suspendedUntil)
        : null;

  const bannedMs = bannedAt ? bannedAt.getTime() : NaN;
  const suspendedMs = suspendedUntil ? suspendedUntil.getTime() : NaN;

  const isBanned = Number.isFinite(bannedMs);
  const isSuspended = Number.isFinite(suspendedMs) && suspendedMs > now.getTime();

  return {
    isBanned,
    bannedAt: isBanned && bannedAt ? bannedAt.toISOString() : null,
    bannedReason: asStringOrNull(row?.bannedReason),
    isSuspended,
    suspendedUntil:
      isSuspended && suspendedUntil
        ? suspendedUntil.toISOString()
        : suspendedUntil && Number.isFinite(suspendedMs)
          ? suspendedUntil.toISOString()
          : null,
  };
}

export async function getCarrierProfileByUserId(prisma: any, userId: string) {
  const anyPrisma = prisma as any;
  const model = anyPrisma?.carrierProfile;

  if (!model || (typeof model.findUnique !== "function" && typeof model.findFirst !== "function")) {
    throw new HttpError(
      501,
      "CARRIER_MODEL_MISSING",
      "Carrier model is not available yet. Run the Prisma migration for CarrierProfile first.",
    );
  }

  const select = {
    id: true,
    userId: true,
    planTier: true,
    verificationStatus: true,
    status: true,
    vehicleType: true,
    lastSeenAt: true,
    lastSeenLat: true,
    lastSeenLng: true,
    bannedAt: true,
    bannedReason: true,
    suspendedUntil: true,
  };

  if (typeof model.findUnique === "function") {
    try {
      return await model.findUnique({ where: { userId }, select });
    } catch {
      // fall through to findFirst if available
    }
  }

  if (typeof model.findFirst === "function") {
    return await model.findFirst({ where: { userId }, select });
  }

  return null;
}

export async function getCarrierOwnerUserIdByCarrierId(prisma: any, carrierId: string): Promise<string | null> {
  const anyPrisma = prisma as any;
  const model = anyPrisma?.carrierProfile;

  if (!model) return null;

  if (typeof model.findUnique === "function") {
    try {
      const c = await model.findUnique({ where: { id: carrierId }, select: { userId: true } });
      return typeof c?.userId === "string" ? c.userId : null;
    } catch {
      // ignore
    }
  }

  if (typeof model.findFirst === "function") {
    try {
      const c = await model.findFirst({ where: { id: carrierId }, select: { userId: true } });
      return typeof c?.userId === "string" ? c.userId : null;
    } catch {
      // ignore
    }
  }

  return null;
}

export async function requireCarrier(prisma: any) {
  const u = await requireUser(prisma);

  const carrier = await getCarrierProfileByUserId(prisma, u.id).catch((e) => {
    if (isHttpError(e)) throw e;
    throw new HttpError(500, "CARRIER_LOOKUP_FAILED", "Failed to load carrier profile.");
  });

  if (!carrier?.id) {
    throw new HttpError(409, "CARRIER_REQUIRED", "Carrier profile required.");
  }

  const enforcement = carrierEnforcementFromRow(carrier);

  if (enforcement.isBanned) {
    throw new HttpError(403, "CARRIER_BANNED", "Carrier is banned.", {
      bannedAt: enforcement.bannedAt,
      bannedReason: enforcement.bannedReason,
    });
  }

  if (enforcement.isSuspended) {
    throw new HttpError(403, "CARRIER_SUSPENDED", "Carrier is suspended.", {
      suspendedUntil: enforcement.suspendedUntil,
    });
  }

  return { user: u, carrier, enforcement };
}

export async function ensureCarrierAssignable(prisma: any, carrierId: string) {
  const anyPrisma = prisma as any;
  const model = anyPrisma?.carrierProfile;

  if (!model || (typeof model.findUnique !== "function" && typeof model.findFirst !== "function")) {
    throw new HttpError(
      501,
      "CARRIER_MODEL_MISSING",
      "Carrier model is not available yet. Run the Prisma migration for CarrierProfile first.",
    );
  }

  let carrier: any = null;

  if (typeof model.findUnique === "function") {
    try {
      carrier = await model.findUnique({
        where: { id: carrierId },
        select: { id: true, bannedAt: true, bannedReason: true, suspendedUntil: true, status: true },
      });
    } catch {
      carrier = null;
    }
  }

  if (!carrier && typeof model.findFirst === "function") {
    carrier = await model.findFirst({
      where: { id: carrierId },
      select: { id: true, bannedAt: true, bannedReason: true, suspendedUntil: true, status: true },
    });
  }

  if (!carrier?.id) {
    throw new HttpError(400, "CARRIER_NOT_FOUND", "Invalid carrierId.");
  }

  const enforcement = carrierEnforcementFromRow(carrier);

  if (enforcement.isBanned) {
    throw new HttpError(409, "CARRIER_BANNED", "Selected carrier is banned.", {
      bannedAt: enforcement.bannedAt,
      bannedReason: enforcement.bannedReason,
    });
  }

  if (enforcement.isSuspended) {
    throw new HttpError(409, "CARRIER_SUSPENDED", "Selected carrier is currently suspended.", {
      suspendedUntil: enforcement.suspendedUntil,
    });
  }

  return { carrier, enforcement };
}
