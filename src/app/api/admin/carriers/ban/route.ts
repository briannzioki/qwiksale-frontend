// src/app/api/admin/carriers/ban/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { assertAdmin } from "../../_lib/guard";
import { withApiLogging, type RequestLog } from "@/app/lib/api-logging";

function jsonNoStore(payload: unknown, init?: ResponseInit) {
  const res = NextResponse.json(payload, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}

function badRequest(message: string) {
  return jsonNoStore({ error: message }, { status: 400 });
}

function notFound(message = "Carrier not found") {
  return jsonNoStore({ error: message }, { status: 404 });
}

async function readJson(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("application/json")) return null;
    return await req.json();
  } catch {
    return null;
  }
}

function cleanStr(v: any, max: number) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function cleanEmail(v: any) {
  const s = cleanStr(v, 254);
  if (!s) return null;
  return s.toLowerCase();
}

function toIso(v: any) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  const ms = d.getTime();
  return Number.isFinite(ms) ? d.toISOString() : null;
}

function pickCarrierModel(anyPrisma: any) {
  return (
    anyPrisma?.carrierProfile ??
    anyPrisma?.carrier ??
    anyPrisma?.carriers ??
    anyPrisma?.carrierProfiles ??
    null
  );
}

async function findUserIdByEmail(anyPrisma: any, email: string) {
  const userModel = anyPrisma?.user;
  if (!userModel || typeof userModel.findUnique !== "function") return null;

  const row = await userModel
    .findUnique({ where: { email }, select: { id: true } })
    .catch(() => null);

  const id = row?.id != null ? String(row.id).trim() : "";
  return id ? id : null;
}

/**
 * Resolve a carrier profile row from multiple possible identifiers:
 * - carrierId / id (CarrierProfile.id)
 * - userId (CarrierProfile.userId)
 * - email (User.email -> User.id -> CarrierProfile.userId)
 */
async function resolveCarrierTarget(
  anyPrisma: any,
  carrierModel: any,
  body: any,
  log: RequestLog,
) {
  const select = { id: true, userId: true, bannedAt: true, bannedReason: true };

  const carrierId = cleanStr(body?.carrierId, 120);
  const id = cleanStr(body?.id, 120);
  const userId = cleanStr(body?.userId, 120);
  const email = cleanEmail(body?.email);

  const candidates = [carrierId, id, userId].filter(Boolean) as string[];

  // If email present, resolve to userId and try that too.
  if (email) {
    const uid = await findUserIdByEmail(anyPrisma, email);
    if (uid) candidates.push(uid);
  }

  // De-dupe while preserving order
  const seen = new Set<string>();
  const uniq = candidates.filter((c) => {
    const key = String(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 1) Try as CarrierProfile.id
  for (const c of uniq) {
    try {
      if (typeof carrierModel.findUnique === "function") {
        const row = await carrierModel.findUnique({ where: { id: c }, select }).catch(() => null);
        if (row?.id) return { row, matched: "id", input: c };
      }
      if (typeof carrierModel.findFirst === "function") {
        const row = await carrierModel.findFirst({ where: { id: c }, select }).catch(() => null);
        if (row?.id) return { row, matched: "id", input: c };
      }
    } catch (e: any) {
      log.warn({ err: String(e?.message ?? e), input: c }, "admin_carrier_ban_resolve_by_id_failed");
    }
  }

  // 2) Try as CarrierProfile.userId
  for (const c of uniq) {
    try {
      if (typeof carrierModel.findUnique === "function") {
        const row = await carrierModel
          .findUnique({ where: { userId: c }, select })
          .catch(() => null);
        if (row?.id) return { row, matched: "userId", input: c };
      }
      if (typeof carrierModel.findFirst === "function") {
        const row = await carrierModel
          .findFirst({ where: { userId: c }, select })
          .catch(() => null);
        if (row?.id) return { row, matched: "userId", input: c };
      }
    } catch (e: any) {
      log.warn(
        { err: String(e?.message ?? e), input: c },
        "admin_carrier_ban_resolve_by_userId_failed",
      );
    }
  }

  // 3) Best-effort: if relation filters exist, try user.email directly (may not be supported in all schema variants)
  if (email && typeof carrierModel.findFirst === "function") {
    try {
      const row = await carrierModel
        .findFirst({ where: { user: { email } }, select })
        .catch(() => null);
      if (row?.id) return { row, matched: "user.email", input: email };
    } catch {
      // ignore
    }
  }

  return null;
}

type Body = {
  carrierId?: string;
  id?: string;
  userId?: string;
  email?: string;

  banned?: boolean;
  reason?: string | null;
};

export async function POST(req: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;

  return withApiLogging(req, "/api/admin/carriers/ban", async (log: RequestLog) => {
    const anyPrisma = prisma as any;
    const carrierModel = pickCarrierModel(anyPrisma);

    if (!carrierModel || typeof carrierModel.update !== "function") {
      return jsonNoStore(
        {
          error:
            "Carrier model is not available yet. Run the Prisma migration for CarrierProfile first.",
        },
        { status: 501 },
      );
    }

    const body = (await readJson(req)) as Body | null;
    if (!body) return badRequest("Expected JSON body");

    const banned = Boolean(body.banned);
    const reason = body.reason == null ? null : cleanStr(String(body.reason), 240);

    const resolved = await resolveCarrierTarget(anyPrisma, carrierModel, body, log);
    if (!resolved?.row?.id) return notFound();

    const current = resolved.row;
    const carrierProfileId = String(current.id);
    const carrierOwnerUserId = String(current.userId);

    const currentlyBanned = Boolean(current?.bannedAt);

    // ✅ Idempotent
    if (banned && currentlyBanned) {
      log.info(
        { carrierId: carrierProfileId, userId: carrierOwnerUserId, idempotent: true, matched: resolved.matched },
        "admin_carrier_ban_ok",
      );
      return jsonNoStore({
        ok: true,
        carrierId: carrierProfileId,
        userId: carrierOwnerUserId,
        bannedAt: toIso(current?.bannedAt),
        bannedReason: typeof current?.bannedReason === "string" ? current.bannedReason : null,
      });
    }
    if (!banned && !currentlyBanned) {
      log.info(
        { carrierId: carrierProfileId, userId: carrierOwnerUserId, idempotent: true, matched: resolved.matched },
        "admin_carrier_ban_ok",
      );
      return jsonNoStore({
        ok: true,
        carrierId: carrierProfileId,
        userId: carrierOwnerUserId,
        bannedAt: null,
        bannedReason: null,
      });
    }

    const now = new Date();

    // Preferred update (schema supports bannedReason in your prisma)
    const dataWithReason: any = banned
      ? { bannedAt: now, bannedReason: reason || "Admin action" }
      : { bannedAt: null, bannedReason: null };

    // Fallback if some envs are missing bannedReason
    const dataNoReason: any = banned ? { bannedAt: now } : { bannedAt: null };

    try {
      const updated = await carrierModel.update({
        where: { id: carrierProfileId },
        data: dataWithReason,
        select: { id: true, userId: true, bannedAt: true, bannedReason: true },
      });

      log.info(
        { carrierId: carrierProfileId, userId: carrierOwnerUserId, banned, matched: resolved.matched },
        "admin_carrier_ban_ok",
      );

      return jsonNoStore({
        ok: true,
        carrierId: String(updated?.id ?? carrierProfileId),
        userId: String(updated?.userId ?? carrierOwnerUserId),
        bannedAt: toIso(updated?.bannedAt),
        bannedReason: typeof updated?.bannedReason === "string" ? updated.bannedReason : null,
      });
    } catch (e1: any) {
      log.warn({ err: String(e1?.message ?? e1) }, "admin_carrier_ban_retry_simple");

      try {
        const updated2 = await carrierModel.update({
          where: { id: carrierProfileId },
          data: dataNoReason,
          select: { id: true, userId: true, bannedAt: true },
        });

        return jsonNoStore({
          ok: true,
          carrierId: String(updated2?.id ?? carrierProfileId),
          userId: String(updated2?.userId ?? carrierOwnerUserId),
          bannedAt: toIso(updated2?.bannedAt),
          bannedReason: null,
        });
      } catch (e2: any) {
        log.error({ err: String(e2?.message ?? e2) }, "admin_carrier_ban_failed");
        return jsonNoStore({ error: "Failed to update ban state." }, { status: 500 });
      }
    }
  });
}
