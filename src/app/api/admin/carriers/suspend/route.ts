// src/app/api/admin/carriers/suspend/route.ts
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

function badRequest(message: string, extra?: Record<string, unknown>) {
  return jsonNoStore({ error: message, ...(extra ?? {}) }, { status: 400 });
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

function parseDateOrNull(v: any) {
  if (v == null) return null;
  if (v instanceof Date) {
    const ms = v.getTime();
    return Number.isFinite(ms) ? v : null;
  }
  if (typeof v === "number") {
    const d = new Date(v);
    const ms = d.getTime();
    return Number.isFinite(ms) ? d : null;
  }
  if (typeof v === "string") {
    const d = new Date(v);
    const ms = d.getTime();
    return Number.isFinite(ms) ? d : null;
  }
  return null;
}

function toIso(v: any) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  const ms = d.getTime();
  return Number.isFinite(ms) ? d.toISOString() : null;
}

function sameInstant(a: any, b: any) {
  const A = a ? new Date(a).getTime() : NaN;
  const B = b ? new Date(b).getTime() : NaN;
  if (!Number.isFinite(A) && !Number.isFinite(B)) return true;
  if (!Number.isFinite(A) || !Number.isFinite(B)) return false;
  return Math.abs(A - B) <= 1000; // 1s tolerance
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

async function resolveCarrierTarget(
  anyPrisma: any,
  carrierModel: any,
  body: any,
  log: RequestLog,
) {
  const select = { id: true, userId: true, suspendedUntil: true };

  const carrierId = cleanStr(body?.carrierId, 120);
  const id = cleanStr(body?.id, 120);
  const userId = cleanStr(body?.userId, 120);
  const email = cleanEmail(body?.email);

  const candidates = [carrierId, id, userId].filter(Boolean) as string[];

  if (email) {
    const uid = await findUserIdByEmail(anyPrisma, email);
    if (uid) candidates.push(uid);
  }

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
      log.warn(
        { err: String(e?.message ?? e), input: c },
        "admin_carrier_suspend_resolve_by_id_failed",
      );
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
        "admin_carrier_suspend_resolve_by_userId_failed",
      );
    }
  }

  // 3) Best-effort: user.email filter (may not exist everywhere)
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

  suspendedUntil?: string | number | null;
  reason?: string | null; // accepted but NOT stored (your schema does not include suspendedReason)
};

export async function POST(req: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;

  return withApiLogging(req, "/api/admin/carriers/suspend", async (log: RequestLog) => {
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

    const until = parseDateOrNull(body.suspendedUntil);

    const resolved = await resolveCarrierTarget(anyPrisma, carrierModel, body, log);
    if (!resolved?.row?.id) return notFound();

    const current = resolved.row;
    const carrierProfileId = String(current.id);
    const carrierOwnerUserId = String(current.userId);

    // ✅ Idempotent
    if (until == null && current?.suspendedUntil == null) {
      log.info(
        { carrierId: carrierProfileId, userId: carrierOwnerUserId, mode: "clear", idempotent: true, matched: resolved.matched },
        "admin_carrier_suspend_ok",
      );
      return jsonNoStore({
        ok: true,
        carrierId: carrierProfileId,
        userId: carrierOwnerUserId,
        suspendedUntil: null,
      });
    }

    if (until != null && sameInstant(current?.suspendedUntil, until)) {
      log.info(
        { carrierId: carrierProfileId, userId: carrierOwnerUserId, mode: "set", idempotent: true, matched: resolved.matched },
        "admin_carrier_suspend_ok",
      );
      return jsonNoStore({
        ok: true,
        carrierId: carrierProfileId,
        userId: carrierOwnerUserId,
        suspendedUntil: toIso(current?.suspendedUntil),
      });
    }

    try {
      const updated = await carrierModel.update({
        where: { id: carrierProfileId },
        data: { suspendedUntil: until },
        select: { id: true, userId: true, suspendedUntil: true },
      });

      log.info(
        { carrierId: carrierProfileId, userId: carrierOwnerUserId, suspendedUntil: toIso(updated?.suspendedUntil), matched: resolved.matched },
        "admin_carrier_suspend_ok",
      );

      return jsonNoStore({
        ok: true,
        carrierId: String(updated?.id ?? carrierProfileId),
        userId: String(updated?.userId ?? carrierOwnerUserId),
        suspendedUntil: toIso(updated?.suspendedUntil),
      });
    } catch (e: any) {
      log.error({ err: String(e?.message ?? e) }, "admin_carrier_suspend_failed");
      return jsonNoStore({ error: "Failed to update suspension." }, { status: 500 });
    }
  });
}
