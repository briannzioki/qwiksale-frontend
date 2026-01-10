export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { withApiLogging, type RequestLog } from "@/app/lib/api-logging";
import { auth } from "@/auth";

/** tiny helper to ensure proper caching/vary on all JSON */
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

async function getAuthedUserId(): Promise<string | null> {
  const session = await auth().catch(() => null);
  const userAny = (session as any)?.user ?? null;

  const id = typeof userAny?.id === "string" ? userAny.id.trim() : "";
  if (id) return id;

  const email = typeof userAny?.email === "string" ? userAny.email.trim().toLowerCase() : "";
  if (!email) return null;

  const anyPrisma = prisma as any;
  const userModel = anyPrisma?.user;
  if (userModel && typeof userModel.findUnique === "function") {
    const u = await userModel
      .findUnique({ where: { email }, select: { id: true } })
      .catch(() => null);
    const uid = typeof u?.id === "string" ? String(u.id).trim() : "";
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
  const userId = await getAuthedUserId();
  if (!userId) return unauthorized();

  return withApiLogging(req, "/api/carrier/requests/[id]/complete", async (log: RequestLog) => {
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
        select: { id: true, bannedAt: true, suspendedUntil: true },
      });
    } catch {
      profile = null;
    }
    if (!profile && typeof carrierModel.findFirst === "function") {
      try {
        profile = await carrierModel.findFirst({
          where: { userId },
          select: { id: true, bannedAt: true, suspendedUntil: true },
        });
      } catch {
        profile = null;
      }
    }

    if (!profile?.id) return forbidden("Carrier profile required. Complete onboarding first.");
    if (profile.bannedAt) return forbidden("You are banned from carrier actions.");
    if (isFuture(profile.suspendedUntil)) return forbidden("You are temporarily suspended from carrier actions.");

    const carrierId = String(profile.id);
    const now = new Date();

    try {
      const updated = await requestModel.updateMany({
        where: {
          id,
          carrierId,
          NOT: [{ status: "CANCELLED" }, { status: "COMPLETED" }],
        },
        data: {
          status: "COMPLETED",
          completedAt: now,
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
          if (String(row.carrierId || "") !== carrierId) return forbidden("This request is not assigned to you.");
          if (row.cancelledAt || String(row.status || "").toUpperCase() === "CANCELLED") {
            return badRequest("This request was cancelled and cannot be completed.");
          }
          if (row.completedAt || String(row.status || "").toUpperCase() === "COMPLETED") {
            return jsonNoStore({
              ok: true,
              request: {
                id,
                status: "COMPLETED",
                completedAt: toIso(row.completedAt) ?? now.toISOString(),
              },
            });
          }
          return badRequest(
            `This request cannot be completed in its current state (${String(row.status || "UNKNOWN")}).`,
          );
        }

        return badRequest("This request cannot be completed.");
      }

      log.info({ userId, carrierId, requestId: id }, "carrier_request_complete_ok");

      return jsonNoStore({
        ok: true,
        request: {
          id,
          status: "COMPLETED",
          completedAt: now.toISOString(),
        },
      });
    } catch (e: any) {
      log.error({ err: String(e?.message ?? e) }, "carrier_request_complete_failed");
      return jsonNoStore({ error: "Failed to complete request." }, { status: 500 });
    }
  });
}
