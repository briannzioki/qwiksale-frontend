// src/app/api/delivery/requests/[id]/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { withApiLogging, type RequestLog } from "@/app/lib/api-logging";
import { getCarrierOwnerUserIdByCarrierId, requireUser } from "@/app/lib/authz";

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

function toIso(v: any) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  const ms = d.getTime();
  return Number.isFinite(ms) ? d.toISOString() : null;
}

async function findRequest(model: any, id: string) {
  // ✅ DeliveryRequest schema does NOT include vehicleType in your current migrations.
  // Keep the select minimal + schema-safe.
  const selectA = {
    id: true,
    status: true,
    type: true,
    requesterUserId: true,
    carrierId: true,
    productId: true,
    storeId: true,
    pickupLat: true,
    pickupLng: true,
    pickupLabel: true,
    pickupNear: true,
    dropoffLat: true,
    dropoffLng: true,
    dropoffLabel: true,
    note: true,
    createdAt: true,
    updatedAt: true,
    cancelledAt: true,
    completedAt: true,
  };

  const selectB = {
    id: true,
    status: true,
    type: true,
    requesterId: true,
    carrierId: true,
    productId: true,
    storeId: true,
    pickupLat: true,
    pickupLng: true,
    pickupLabel: true,
    pickupNear: true,
    dropoffLat: true,
    dropoffLng: true,
    dropoffLabel: true,
    note: true,
    createdAt: true,
    updatedAt: true,
    cancelledAt: true,
    completedAt: true,
  };

  try {
    return await model.findUnique({ where: { id }, select: selectA });
  } catch {
    return await model.findUnique({ where: { id }, select: selectB });
  }
}

async function bestEffortCarrierVehicleType(anyPrisma: any, carrierId: string | null): Promise<string | null> {
  if (!carrierId) return null;

  try {
    const vehicleModel = anyPrisma?.carrierVehicle;
    if (!vehicleModel || typeof vehicleModel.findFirst !== "function") return null;

    const v = await vehicleModel.findFirst({
      where: { carrierId },
      orderBy: { createdAt: "desc" },
      select: { type: true },
    });

    if (!v) return null;
    if (typeof v.type === "string") return v.type;
    return v.type != null ? String(v.type) : null;
  } catch {
    return null;
  }
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const authz = await requireUser({ mode: "result", callbackUrl: "/api/delivery/requests/[id]" });
  if (!authz.authorized) return unauthorized(authz.reason);

  const userId = authz.user.id;

  return withApiLogging(req, "/api/delivery/requests/[id]", async (log: RequestLog) => {
    const params = await ctx.params;
    const id = String((params as any)?.id ?? "").trim();
    if (!id) return notFound("Missing id");

    const anyPrisma = prisma as any;
    const model = anyPrisma?.deliveryRequest;

    if (!model || typeof model.findUnique !== "function") {
      return jsonNoStore(
        {
          error:
            "DeliveryRequest model is not available yet. Run the Prisma migration for delivery requests first.",
        },
        { status: 501 },
      );
    }

    let reqRow: any = null;
    try {
      reqRow = await findRequest(model, id);
    } catch (e: any) {
      log.error({ err: String(e?.message ?? e) }, "delivery_request_find_failed");
      return notFound();
    }

    if (!reqRow) return notFound();

    const requesterUserId =
      typeof reqRow.requesterUserId === "string"
        ? reqRow.requesterUserId
        : typeof reqRow.requesterId === "string"
          ? reqRow.requesterId
          : null;

    const carrierId = typeof reqRow.carrierId === "string" ? reqRow.carrierId : null;

    const isRequester = Boolean(requesterUserId && requesterUserId === userId);

    let isAssignedCarrierOwner = false;
    if (!isRequester && carrierId) {
      try {
        const ownerUserId = await getCarrierOwnerUserIdByCarrierId(prisma, carrierId);
        isAssignedCarrierOwner = !!ownerUserId && ownerUserId === userId;
      } catch {
        isAssignedCarrierOwner = false;
      }
    }

    if (!isRequester && !isAssignedCarrierOwner) {
      return forbidden("You do not have access to this request.");
    }

    const pickupLabel =
      typeof reqRow.pickupLabel === "string"
        ? reqRow.pickupLabel
        : typeof reqRow.pickupNear === "string"
          ? reqRow.pickupNear
          : null;

    // ✅ Derive vehicleType from latest CarrierVehicle (best-effort)
    const vehicleType = await bestEffortCarrierVehicleType(anyPrisma, carrierId);

    const payload = {
      id: String(reqRow.id),
      status: String(reqRow.status),
      type: String(reqRow.type),
      requesterUserId: requesterUserId,
      carrierId: carrierId,
      productId: typeof reqRow.productId === "string" ? reqRow.productId : null,
      storeId: typeof reqRow.storeId === "string" ? reqRow.storeId : null,
      pickup: {
        lat: typeof reqRow.pickupLat === "number" ? reqRow.pickupLat : Number(reqRow.pickupLat),
        lng: typeof reqRow.pickupLng === "number" ? reqRow.pickupLng : Number(reqRow.pickupLng),
        label: pickupLabel,
      },
      dropoff:
        reqRow.dropoffLat != null && reqRow.dropoffLng != null
          ? {
              lat:
                typeof reqRow.dropoffLat === "number"
                  ? reqRow.dropoffLat
                  : Number(reqRow.dropoffLat),
              lng:
                typeof reqRow.dropoffLng === "number"
                  ? reqRow.dropoffLng
                  : Number(reqRow.dropoffLng),
              label: typeof reqRow.dropoffLabel === "string" ? reqRow.dropoffLabel : null,
            }
          : null,
      note: typeof reqRow.note === "string" ? reqRow.note : null,

      // ✅ no longer read from DeliveryRequest table
      vehicleType,

      createdAt: toIso(reqRow.createdAt),
      updatedAt: toIso(reqRow.updatedAt),
      cancelledAt: toIso(reqRow.cancelledAt),
      completedAt: toIso(reqRow.completedAt),
      access: { isRequester, isAssignedCarrierOwner },
    };

    log.info({ userId, requestId: id, access: payload.access }, "delivery_request_get_ok");

    return jsonNoStore({ request: payload });
  });
}
