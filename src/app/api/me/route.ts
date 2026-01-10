// src/app/api/me/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

/** Bump when behavior changes for observability */
const VERSION = "me.v15-never-crash";

/**
 * E2E/test flag only used for metadata/headers.
 * Status codes stay the same in prod and E2E.
 */
const IS_E2E =
  process.env["NEXT_PUBLIC_E2E"] === "1" ||
  process.env["E2E"] === "1" ||
  process.env["PLAYWRIGHT"] === "1" ||
  process.env["PLAYWRIGHT_TEST"] === "1" ||
  process.env["VITEST"] === "1";

function baseHeaders(h: Headers = new Headers()) {
  h.set("Cache-Control", "no-store, no-cache, must-revalidate");
  h.set("Pragma", "no-cache");
  h.set("Expires", "0");
  h.set("Vary", "Authorization, Cookie, Accept-Encoding, Origin");
  h.set("X-Me-Version", VERSION);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "no-referrer");
  h.set("Allow", "GET,HEAD,OPTIONS");
  if (IS_E2E) h.set("X-Me-Env", "e2e");
  return h;
}

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init);
  baseHeaders(res.headers);
  return res;
}

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function toIso(v: any) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  const ms = d.getTime();
  return Number.isFinite(ms) ? d.toISOString() : null;
}

function isFuture(v: any) {
  if (!v) return false;
  const d = v instanceof Date ? v : new Date(String(v));
  const ms = d.getTime();
  return Number.isFinite(ms) && ms > Date.now();
}

function parseMaybeInt(v: string): number | null {
  const s = String(v || "").trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function splitList(v?: string | null) {
  return (v ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const ADMIN_ALLOW = new Set(splitList(process.env["ADMIN_EMAILS"]));
const SUPERADMIN_ALLOW = new Set(splitList(process.env["SUPERADMIN_EMAILS"]));

function roleUpper(v: unknown): string {
  return typeof v === "string" ? v.trim().toUpperCase() : "";
}

function computeAdminFlagsLocal(input: {
  email?: string | null;
  role?: string | null;
  isAdmin?: boolean | null;
  isSuperAdmin?: boolean | null;
}) {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : null;
  const role = roleUpper(input.role);

  const allowSuper = !!email && SUPERADMIN_ALLOW.has(email);
  const allowAdmin = !!email && (ADMIN_ALLOW.has(email) || allowSuper);

  const isSuperAdmin = input.isSuperAdmin === true || role === "SUPERADMIN" || allowSuper;
  const isAdmin = input.isAdmin === true || isSuperAdmin || role === "ADMIN" || allowAdmin;

  return { isAdmin, isSuperAdmin };
}

function pickCarrierModel(anyPrisma: any) {
  return anyPrisma?.carrierProfile ?? anyPrisma?.carrier ?? anyPrisma?.carriers ?? anyPrisma?.carrierProfiles ?? null;
}

async function findCarrierForUser(anyPrisma: any, userId: string, email: string | null) {
  const carrierModel = pickCarrierModel(anyPrisma);
  if (!carrierModel) return null;

  // Be careful: some schemas may not include relation `user`
  const baseSelect: any = {
    id: true,
    userId: true,
    status: true,
    planTier: true,
    verificationStatus: true,
    bannedAt: true,
    bannedReason: true,
    suspendedUntil: true,
  };

  const selectWithUser: any = {
    ...baseSelect,
    user: { select: { email: true, name: true } },
  };

  const userIdAsInt = parseMaybeInt(userId);

  const tryFindUnique = async (where: any) => {
    if (typeof carrierModel.findUnique !== "function") return null;
    try {
      return await carrierModel.findUnique({ where, select: selectWithUser });
    } catch {
      try {
        return await carrierModel.findUnique({ where, select: baseSelect });
      } catch {
        return null;
      }
    }
  };

  const tryFindFirst = async (where: any) => {
    if (typeof carrierModel.findFirst !== "function") return null;
    try {
      return await carrierModel.findFirst({ where, select: selectWithUser });
    } catch {
      try {
        return await carrierModel.findFirst({ where, select: baseSelect });
      } catch {
        return null;
      }
    }
  };

  // 1) by userId (string / int)
  const byUserId = (await tryFindUnique({ userId })) ?? (await tryFindFirst({ userId }));
  if (byUserId) return byUserId;

  if (userIdAsInt != null) {
    const byInt = (await tryFindUnique({ userId: userIdAsInt })) ?? (await tryFindFirst({ userId: userIdAsInt }));
    if (byInt) return byInt;
  }

  // 2) fallback by relation email (only works if schema has relation `user`)
  if (email) {
    const byEmail = await tryFindFirst({ user: { email } });
    if (byEmail) return byEmail;
  }

  return null;
}

async function readSessionUser(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return null;

    const userAny = (session as any)?.user ?? null;
    if (!userAny) return null;

    const idRaw = userAny?.id != null ? String(userAny.id).trim() : "";
    const email = typeof userAny?.email === "string" ? userAny.email.trim().toLowerCase() : null;

    const roleRaw =
      typeof userAny?.role === "string"
        ? userAny.role
        : typeof (session as any)?.role === "string"
          ? (session as any).role
          : null;

    const username =
      typeof userAny?.username === "string"
        ? userAny.username
        : typeof (userAny as any)?.handle === "string"
          ? (userAny as any).handle
          : null;

    const image =
      typeof userAny?.image === "string"
        ? userAny.image
        : typeof (userAny as any)?.picture === "string"
          ? (userAny as any).picture
          : null;

    const name = typeof userAny?.name === "string" ? userAny.name : null;

    return {
      id: idRaw || null,
      email,
      role: roleRaw ? String(roleRaw) : null,
      username,
      image,
      name,
      isAdmin: userAny?.isAdmin === true,
      isSuperAdmin: userAny?.isSuperAdmin === true,
      // debug-only: helps in traces
      _cookieLen: (req.headers.get("cookie") || "").length,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const u = await readSessionUser(req);

    if (!u) {
      const res = noStore(
        { user: null, meta: { env: IS_E2E ? "e2e" : "prod", probe: "session_null" } },
        { status: 401 },
      );
      res.headers.set("X-Me-Probe", "session_null");
      return res;
    }

    // ✅ If session has no id but has email, reconcile id via DB in dev/e2e
    let resolvedId = u.id;
    const anyPrisma = prisma as any;

    const shouldReconcile =
      !!u.email &&
      (IS_E2E ||
        process.env.NODE_ENV !== "production" ||
        !resolvedId ||
        resolvedId === "undefined" ||
        resolvedId === "null");

    if (shouldReconcile && u.email) {
      try {
        const row = await anyPrisma?.user?.findUnique?.({
          where: { email: u.email },
          select: { id: true },
        });
        const dbId =
          typeof row?.id === "string" ? row.id.trim() : row?.id != null ? String(row.id).trim() : "";
        if (dbId) resolvedId = dbId;
      } catch {
        // ignore
      }
    }

    if (!resolvedId) {
      const res = noStore(
        { user: null, meta: { env: IS_E2E ? "e2e" : "prod", probe: "missing_id" } },
        { status: 401 },
      );
      res.headers.set("X-Me-Probe", "missing_id");
      return res;
    }

    const email = u.email;
    const role = safeTrim(u.role) || null;

    const flags = computeAdminFlagsLocal({
      email,
      role,
      isAdmin: u.isAdmin === true,
      isSuperAdmin: u.isSuperAdmin === true,
    });

    const carrier = await findCarrierForUser(anyPrisma, resolvedId, email);

    const bannedAt = toIso(carrier?.bannedAt);
    const bannedReason = typeof carrier?.bannedReason === "string" ? carrier.bannedReason : null;
    const suspendedUntil = toIso(carrier?.suspendedUntil);

    const isSuspended = isFuture(carrier?.suspendedUntil);
    const isBanned = !!carrier?.bannedAt;

    const minimalUser = {
      id: resolvedId,
      email,
      username: typeof u.username === "string" ? u.username : null,
      image: typeof u.image === "string" ? u.image : null,
      role,
      isAdmin: flags.isAdmin,
      isSuperAdmin: flags.isSuperAdmin,
    };

    const payload = {
      ...minimalUser,

      bannedAt: isBanned ? bannedAt : null,
      bannedReason: isBanned ? bannedReason : null,
      suspendedUntil: suspendedUntil, // keep iso if set (even if past) for debugging

      carrier: carrier
        ? {
            id: String(carrier.id),
            userId: String(carrier.userId ?? resolvedId),
            status: (carrier as any).status ?? null,
            planTier: (carrier as any).planTier ?? null,
            verificationStatus: (carrier as any).verificationStatus ?? null,
            bannedAt,
            bannedReason,
            suspendedUntil,
            enforcement: {
              banned: isBanned,
              suspended: isSuspended,
            },
          }
        : null,

      user: minimalUser,

      meta: {
        env: IS_E2E ? "e2e" : "prod",
        carrierFound: !!carrier,
        resolvedId,
        cookieLen: (u as any)._cookieLen ?? null,
      },
    };

    const res = noStore(payload, { status: 200 });
    res.headers.set("X-Me-Probe", "ok");
    res.headers.set("X-Me-Carrier", carrier ? "1" : "0");
    res.headers.set("X-Me-UserId", resolvedId);
    return res;
  } catch (e: any) {
    // ✅ Never crash the server / connection: always return JSON.
    const verbose = IS_E2E || process.env.NODE_ENV !== "production";
    const detail = verbose ? String(e?.message ?? e) : undefined;

    const res = noStore(
      {
        user: null,
        error: "Server error",
        ...(detail ? { detail } : {}),
        meta: { env: IS_E2E ? "e2e" : "prod", probe: "caught_exception" },
      },
      { status: 500 },
    );
    res.headers.set("X-Me-Probe", "caught_exception");
    return res;
  }
}

export async function HEAD() {
  return new Response(null, { status: 200, headers: baseHeaders() });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: baseHeaders() });
}
