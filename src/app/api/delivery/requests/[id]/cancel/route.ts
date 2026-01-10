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

function notFound(message = "Not found") {
  return jsonNoStore({ error: message }, { status: 404 });
}

function forbidden(message = "Forbidden") {
  return jsonNoStore({ error: message }, { status: 403 });
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

function toIso(v: any) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  const ms = d.getTime();
  return Number.isFinite(ms) ? d.toISOString() : null;
}

async function findCancelableRow(model: any, id: string) {
  const selectA = {
    id: true,
    status: true,
    requesterUserId: true,
    carrierId: true,
    cancelledAt: true,
    completedAt: true,
  };
  const selectB = {
    id: true,
    status: true,
    requesterId: true,
    carrierId: true,
    cancelledAt: true,
    completedAt: true,
  };

  try {
    return await model.findUnique({ where: { id }, select: selectA });
  } catch {
    return await model.findUnique({ where: { id }, select: selectB });
  }
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const userId = await getAuthedUserId();
  if (!userId) return unauthorized();

  return withApiLogging(req, "/api/delivery/requests/[id]/cancel", async (log: RequestLog) => {
    const params = await ctx.params;
    const id = String((params as any)?.id ?? "").trim();
    if (!id) return notFound("Missing id");

    const anyPrisma = prisma as any;
    const model = anyPrisma?.deliveryRequest;

    if (!model || typeof model.findUnique !== "function" || typeof model.update !== "function") {
      return jsonNoStore(
        {
          error:
            "DeliveryRequest model is not available yet. Run the Prisma migration for delivery requests first.",
        },
        { status: 501 },
      );
    }

    let row: any = null;
    try {
      row = await findCancelableRow(model, id);
    } catch {
      row = null;
    }

    if (!row) return notFound();

    const requesterUserId =
      typeof row.requesterUserId === "string"
        ? row.requesterUserId
        : typeof row.requesterId === "string"
          ? row.requesterId
          : null;

    if (!requesterUserId || requesterUserId !== userId) {
      return forbidden("Only the requester can cancel this request.");
    }

    const status = String(row.status || "").toUpperCase();
    if (status === "CANCELLED") {
      return jsonNoStore({
        ok: true,
        request: {
          id: String(row.id),
          status: "CANCELLED",
          cancelledAt: toIso(row.cancelledAt) ?? new Date().toISOString(),
        },
      });
    }

    if (status === "COMPLETED") {
      return badRequest("Completed requests cannot be cancelled.");
    }

    if (status === "IN_PROGRESS" || status === "ON_TRIP") {
      return badRequest("This request is already in progress and cannot be cancelled.");
    }

    const now = new Date();

    try {
      const updated = await model.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
        },
        select: { id: true, status: true, cancelledAt: true },
      });

      log.info({ userId, requestId: id }, "delivery_request_cancel_ok");

      return jsonNoStore({
        ok: true,
        request: {
          id: String(updated?.id ?? id),
          status: String(updated?.status ?? "CANCELLED"),
          cancelledAt: updated?.cancelledAt ? new Date(updated.cancelledAt).toISOString() : now.toISOString(),
        },
      });
    } catch (e: any) {
      log.error({ err: String(e?.message ?? e) }, "delivery_request_cancel_failed");
      return jsonNoStore({ error: "Failed to cancel request." }, { status: 500 });
    }
  });
}
