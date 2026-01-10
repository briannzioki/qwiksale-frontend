export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { withApiLogging, type RequestLog } from "@/app/lib/api-logging";
import { ensureCarrierAssignable, isHttpError, requireUser } from "@/app/lib/authz";

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

function badRequest(message: string, extra?: Record<string, unknown>) {
  return jsonNoStore({ error: message, ...(extra ?? {}) }, { status: 400 });
}

function conflict(message: string, extra?: Record<string, unknown>) {
  return jsonNoStore({ error: message, ...(extra ?? {}) }, { status: 409 });
}

function toNum(v: any) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
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

type CreateBody = {
  type?: "DELIVERY" | "CONFIRM_AVAILABILITY" | string;

  productId?: string | null;
  storeId?: string | null;
  carrierId?: string | null;

  pickup?: { lat?: number; lng?: number; label?: string | null } | null;
  dropoff?: { lat?: number; lng?: number; label?: string | null } | null;

  vehicleType?: string | null;
  note?: string | null;
};

function looksLikeEnumMismatch(err: any) {
  const msg = String(err?.message ?? "");
  return msg.toLowerCase().includes("invalid") && msg.toLowerCase().includes("enum");
}

async function createWithSelectVariants(model: any, dataBase: any) {
  const selectA = {
    id: true,
    status: true,
    type: true,
    carrierId: true,
    requesterUserId: true,
    createdAt: true,
  };

  const selectB = {
    id: true,
    status: true,
    type: true,
    carrierId: true,
    requesterId: true,
    createdAt: true,
  };

  try {
    return await model.create({
      data: dataBase,
      select: selectA,
    });
  } catch {
    return await model.create({
      data: {
        ...dataBase,
        requesterId: dataBase.requesterUserId,
      },
      select: selectB,
    });
  }
}

export async function POST(req: NextRequest) {
  const authz = await requireUser({ mode: "result", callbackUrl: "/api/delivery/requests" });
  if (!authz.authorized) return unauthorized(authz.reason);

  const userId = authz.user.id;

  return withApiLogging(req, "/api/delivery/requests", async (log: RequestLog) => {
    const anyPrisma = prisma as any;
    const model = anyPrisma?.deliveryRequest;

    if (!model || typeof model.create !== "function") {
      return jsonNoStore(
        {
          error: "DeliveryRequest model is not available yet. Run the Prisma migration for delivery requests first.",
        },
        { status: 501 },
      );
    }

    const body = (await readJson(req)) as CreateBody | null;
    if (!body) return badRequest("Expected JSON body");

    const typeRaw = String(body.type || "").trim().toUpperCase();
    const type = typeRaw === "DELIVERY" ? "DELIVERY" : typeRaw === "CONFIRM_AVAILABILITY" ? "CONFIRM_AVAILABILITY" : null;

    if (!type) return badRequest("Invalid request type. Expected DELIVERY or CONFIRM_AVAILABILITY.");

    const pickupLat = toNum(body.pickup?.lat);
    const pickupLng = toNum(body.pickup?.lng);
    if (pickupLat == null || pickupLng == null) return badRequest("pickup.lat and pickup.lng are required numbers");

    const dropoffLat = toNum(body.dropoff?.lat);
    const dropoffLng = toNum(body.dropoff?.lng);

    const productId = typeof body.productId === "string" && body.productId.trim() ? body.productId.trim() : null;
    const storeId = typeof body.storeId === "string" && body.storeId.trim() ? body.storeId.trim() : null;
    const carrierId = typeof body.carrierId === "string" && body.carrierId.trim() ? body.carrierId.trim() : null;

    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 1000) : null;

    const vehicleType =
      typeof body.vehicleType === "string" && body.vehicleType.trim() ? body.vehicleType.trim().slice(0, 40) : null;

    const pickupLabel =
      typeof body.pickup?.label === "string" && body.pickup.label.trim() ? body.pickup.label.trim().slice(0, 140) : null;

    const dropoffLabel =
      typeof body.dropoff?.label === "string" && body.dropoff.label.trim()
        ? body.dropoff.label.trim().slice(0, 140)
        : null;

    if (carrierId) {
      try {
        await ensureCarrierAssignable(prisma, carrierId);
      } catch (e) {
        if (isHttpError(e)) {
          if (e.status === 501) return jsonNoStore({ error: e.message }, { status: 501 });
          if (e.status === 409) return conflict(e.message, e.details);
          return badRequest(e.message, e.details);
        }
        return badRequest("Invalid carrierId.");
      }
    }

    const statusPrimary = carrierId ? "ASSIGNED" : "PENDING";
    const statusAlt = carrierId ? "ASSIGNED" : "REQUESTED";

    const dataBase: any = {
      requesterUserId: userId,
      carrierId,
      status: statusPrimary,
      type,
      productId,
      storeId,
      pickupLat,
      pickupLng,
      pickupLabel,
      dropoffLat,
      dropoffLng,
      dropoffLabel,
      note,
      vehicleType,
    };

    let created: any = null;
    try {
      created = await createWithSelectVariants(model, dataBase);
    } catch (e: any) {
      if (looksLikeEnumMismatch(e) && !carrierId) {
        try {
          created = await createWithSelectVariants(model, { ...dataBase, status: statusAlt });
        } catch (e2: any) {
          log.error({ err: String(e2?.message ?? e2) }, "delivery_request_create_failed_retry");
          return jsonNoStore({ error: "Failed to create request." }, { status: 500 });
        }
      } else {
        log.error({ err: String(e?.message ?? e) }, "delivery_request_create_failed");
        return jsonNoStore({ error: "Failed to create request." }, { status: 500 });
      }
    }

    const requester =
      typeof created?.requesterUserId === "string"
        ? String(created.requesterUserId)
        : typeof created?.requesterId === "string"
          ? String(created.requesterId)
          : userId;

    log.info({ userId, created: { id: created?.id, type: created?.type, status: created?.status } }, "delivery_request_created");

    return jsonNoStore({
      ok: true,
      request: {
        id: String(created?.id ?? ""),
        status: String(created?.status ?? statusPrimary),
        type: String(created?.type ?? type),
        carrierId: created?.carrierId ? String(created.carrierId) : null,
        requesterUserId: requester,
        createdAt: created?.createdAt ? new Date(created.createdAt).toISOString() : new Date().toISOString(),
      },
    });
  });
}
