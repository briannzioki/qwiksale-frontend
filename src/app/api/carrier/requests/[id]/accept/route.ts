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

function forbidden(message = "Forbidden") {
  return jsonNoStore({ error: message }, { status: 403 });
}

function notFound(message = "Not found") {
  return jsonNoStore({ error: message }, { status: 404 });
}

function badRequest(message: string) {
  return jsonNoStore({ error: message }, { status: 400 });
}

type AuthzUserLike = { id?: string | null; email?: string | null };

async function resolveAuthedUserId(u: AuthzUserLike): Promise<string | null> {
  const id = typeof u?.id === "string" ? u.id.trim() : "";
  if (id) return id;

  const email = typeof u?.email === "string" ? u.email.trim().toLowerCase() : "";
  if (!email) return null;

  const anyPrisma = prisma as any;
  const userModel = anyPrisma?.user;
  if (userModel && typeof userModel.findUnique === "function") {
    const row = await userModel
      .findUnique({ where: { email }, select: { id: true } })
      .catch(() => null);
    const uid =
      typeof row?.id === "string" ? row.id.trim() : row?.id ? String(row.id).trim() : "";
    if (uid) return uid;
  }

  return null;
}

function isFuture(v: any) {
  if (!v) return false;
  const d = v instanceof Date ? v : new Date(String(v));
  const ms = d.getTime();
  return Number.isFinite(ms) && ms > Date.now();
}

function toIso(v: any) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  const ms = d.getTime();
  return Number.isFinite(ms) ? d.toISOString() : null;
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const authz = await requireUser({
    mode: "result",
    callbackUrl: "/api/carrier/requests/[id]/accept",
  });
  if (!authz.authorized) return unauthorized(authz.reason);

  const userId = await resolveAuthedUserId(authz.user as any);
  if (!userId) return unauthorized();

  return withApiLogging(req, "/api/carrier/requests/[id]/accept", async (log: RequestLog) => {
    const params = await ctx.params;
    const id = String((params as any)?.id ?? "").trim();
    if (!id) return notFound("Missing id");

    const anyPrisma = prisma as any;
    const carrierModel = anyPrisma?.carrierProfile;
    const requestModel = anyPrisma?.deliveryRequest;

    if (!carrierModel || typeof carrierModel.findUnique !== "function") {
      return jsonNoStore(
        { error: "Carrier model is not available yet. Run the Prisma migration for CarrierProfile first." },
        { status: 501 },
      );
    }
    if (!requestModel || typeof requestModel.updateMany !== "function") {
      return jsonNoStore(
        { error: "DeliveryRequest model is not available yet. Run the Prisma migration for delivery requests first." },
        { status: 501 },
      );
    }

    let profile: any = null;
    try {
      profile = await carrierModel.findUnique({
        where: { userId },
        select: { id: true, bannedAt: true, suspendedUntil: true, status: true },
      });
    } catch {
      profile = null;
    }
    if (!profile && typeof carrierModel.findFirst === "function") {
      try {
        profile = await carrierModel.findFirst({
          where: { userId },
          select: { id: true, bannedAt: true, suspendedUntil: true, status: true },
        });
      } catch {
        profile = null;
      }
    }

    if (!profile?.id) return forbidden("Carrier profile required. Complete onboarding first.");

    if (profile.bannedAt) return forbidden("You are banned from carrier actions.");
    if (isFuture(profile.suspendedUntil)) return forbidden("You are temporarily suspended from carrier actions.");

    const status = String(profile.status || "").toUpperCase();
    if (status !== "AVAILABLE") return badRequest("You must be Online (AVAILABLE) to accept a request.");

    const carrierId = String(profile.id);
    const now = new Date();

    try {
      const updated = await requestModel.updateMany({
        where: {
          id,
          status: { in: ["PENDING", "REQUESTED"] },
          carrierId: null,
        },
        data: {
          carrierId,
          status: "ASSIGNED",
          updatedAt: now,
        },
      });

      const count = typeof updated?.count === "number" ? updated.count : 0;
      if (count === 0) {
        if (typeof requestModel.findUnique === "function") {
          const row = await requestModel.findUnique({
            where: { id },
            select: { id: true, status: true, carrierId: true, cancelledAt: true, completedAt: true },
          });

          if (!row) return notFound();
          const rStatus = String(row.status || "UNKNOWN");
          if (String(row.carrierId || "") && String(row.carrierId) !== carrierId) {
            return badRequest("This request was already accepted by another carrier.");
          }
          if (rStatus === "CANCELLED" || row.cancelledAt) return badRequest("This request was cancelled.");
          if (rStatus === "COMPLETED" || row.completedAt) return badRequest("This request is already completed.");
          return badRequest(`This request cannot be accepted in its current state (${rStatus}).`);
        }

        return badRequest("This request cannot be accepted.");
      }

      log.info({ userId, carrierId, requestId: id }, "carrier_request_accept_ok");

      return jsonNoStore({
        ok: true,
        request: {
          id,
          status: "ASSIGNED",
          carrierId,
          acceptedAt: toIso(now) ?? now.toISOString(),
        },
      });
    } catch (e: any) {
      log.error({ err: String(e?.message ?? e) }, "carrier_request_accept_failed");
      return jsonNoStore({ error: "Failed to accept request." }, { status: 500 });
    }
  });
}
