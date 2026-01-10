// src/app/api/carrier/me/status/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { withApiLogging, type RequestLog } from "@/app/lib/api-logging";
import { requireUser } from "@/app/lib/authz";

function jsonNoStore(payload: unknown, init?: ResponseInit) {
  const res = NextResponse.json(payload, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}

function unauthorized(message = "Unauthorized") {
  return jsonNoStore({ error: message }, { status: 401 });
}

function badRequest(message: string) {
  return jsonNoStore({ error: message }, { status: 400 });
}

function forbidden(message = "Forbidden") {
  return jsonNoStore({ error: message }, { status: 403 });
}

function notFound(message = "Not found") {
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

function pickCarrierModel(anyPrisma: any) {
  return (
    anyPrisma?.carrierProfile ??
    anyPrisma?.carrier ??
    anyPrisma?.carriers ??
    anyPrisma?.carrierProfiles ??
    null
  );
}

async function findCarrierByUserId(carrierModel: any, userId: string) {
  const uidInt = parseMaybeInt(userId);
  const select = { id: true, bannedAt: true, suspendedUntil: true, status: true };

  try {
    if (typeof carrierModel.findUnique === "function") {
      try {
        return await carrierModel.findUnique({ where: { userId }, select });
      } catch {
        if (uidInt != null) {
          return await carrierModel.findUnique({ where: { userId: uidInt }, select });
        }
      }
    }
  } catch {
    // ignore
  }

  try {
    if (typeof carrierModel.findFirst === "function") {
      try {
        return await carrierModel.findFirst({ where: { userId }, select });
      } catch {
        if (uidInt != null) {
          return await carrierModel.findFirst({ where: { userId: uidInt }, select });
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}

type Body = { status?: "OFFLINE" | "AVAILABLE" | "ON_TRIP" | string };

export async function POST(req: NextRequest) {
  const authz = await requireUser({ mode: "result", callbackUrl: "/api/carrier/me/status" });
  if (!authz.authorized) return unauthorized(authz.reason);

  const userId = String((authz.user as any)?.id || "").trim();
  if (!userId) return unauthorized();

  return withApiLogging(req, "/api/carrier/me/status", async (log: RequestLog) => {
    const anyPrisma = prisma as any;
    const carrierModel = pickCarrierModel(anyPrisma);

    if (!carrierModel) {
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

    const sRaw = String(body.status || "").trim().toUpperCase();
    const status =
      sRaw === "AVAILABLE" ? "AVAILABLE" : sRaw === "ON_TRIP" ? "ON_TRIP" : sRaw === "OFFLINE" ? "OFFLINE" : null;

    if (!status) return badRequest("Invalid status. Expected OFFLINE, AVAILABLE, or ON_TRIP.");

    const profile = await findCarrierByUserId(carrierModel, userId);
    if (!profile?.id) return notFound("Carrier profile not found. Complete onboarding first.");

    if (profile.bannedAt) return forbidden("You are banned from carrier actions.");
    if (isFuture(profile.suspendedUntil)) return forbidden("You are temporarily suspended from carrier actions.");

    const now = new Date();

    try {
      const updated = await carrierModel.update({
        where: { id: profile.id },
        data: { status, lastSeenAt: now },
        select: { id: true, status: true, lastSeenAt: true },
      });

      log.info({ userId, carrierId: String(updated?.id ?? profile.id), status }, "carrier_status_set_ok");

      return jsonNoStore({
        ok: true,
        status: String(updated?.status ?? status),
        lastSeenAt: updated?.lastSeenAt ? new Date(updated.lastSeenAt).toISOString() : now.toISOString(),
      });
    } catch (e: any) {
      log.error({ err: String(e?.message ?? e) }, "carrier_status_set_failed");
      return jsonNoStore({ error: "Failed to update carrier status." }, { status: 500 });
    }
  });
}
