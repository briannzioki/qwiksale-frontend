export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { withApiLogging, type RequestLog } from "@/app/lib/api-logging";
import { auth } from "@/auth";

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

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function toNum(v: any) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
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

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const sLat1 = (aLat * Math.PI) / 180;
  const sLat2 = (bLat * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(sLat1) * Math.cos(sLat2);

  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function isFresh(lastSeenAt: any, cutoffSeconds: number) {
  if (!lastSeenAt) return false;
  const d = lastSeenAt instanceof Date ? lastSeenAt : new Date(String(lastSeenAt));
  const ms = d.getTime();
  return Number.isFinite(ms) && Date.now() - ms <= cutoffSeconds * 1000;
}

export async function GET(req: NextRequest) {
  const userId = await getAuthedUserId();
  if (!userId) return unauthorized();

  return withApiLogging(req, "/api/carrier/requests", async (log: RequestLog) => {
    const anyPrisma = prisma as any;
    const carrierModel = anyPrisma?.carrierProfile;
    const requestModel = anyPrisma?.deliveryRequest;

    if (!carrierModel || typeof carrierModel.findUnique !== "function") {
      return jsonNoStore(
        { error: "Carrier model is not available. Run the Prisma migration for CarrierProfile first." },
        { status: 501 },
      );
    }
    if (!requestModel || typeof requestModel.findMany !== "function") {
      return jsonNoStore(
        { error: "DeliveryRequest model is not available. Run the Prisma migration for DeliveryRequest first." },
        { status: 501 },
      );
    }

    const url = new URL(req.url);
    const includeNearby = (url.searchParams.get("includeNearby") || "").trim().toLowerCase() === "true";
    const radiusKm = clamp(toNum(url.searchParams.get("radiusKm")) ?? 5, 1, 20);

    let profile: any = null;
    try {
      profile = await carrierModel.findUnique({
        where: { userId },
        select: {
          id: true,
          bannedAt: true,
          suspendedUntil: true,
          status: true,
          lastSeenAt: true,
          lastSeenLat: true,
          lastSeenLng: true,
        },
      });
    } catch {
      profile = null;
    }

    if (!profile?.id && typeof carrierModel.findFirst === "function") {
      try {
        profile = await carrierModel.findFirst({
          where: { userId },
          select: {
            id: true,
            bannedAt: true,
            suspendedUntil: true,
            status: true,
            lastSeenAt: true,
            lastSeenLat: true,
            lastSeenLng: true,
          },
        });
      } catch {
        profile = null;
      }
    }

    if (!profile?.id) {
      return jsonNoStore({ ok: true, hasProfile: false, assigned: [], nearby: [] });
    }

    if (profile.bannedAt) return forbidden("You are banned from carrier actions.");
    if (isFuture(profile.suspendedUntil)) return forbidden("You are temporarily suspended from carrier actions.");

    const carrierId = String(profile.id);

    const assigned = await requestModel.findMany({
      where: { carrierId },
      take: 50,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        status: true,
        type: true,
        requesterId: true,
        requesterUserId: true,
        carrierId: true,
        productId: true,
        pickupLat: true,
        pickupLng: true,
        pickupLabel: true,
        pickupNear: true,
        dropoffLat: true,
        dropoffLng: true,
        dropoffLabel: true,
        contactPhone: true,
        note: true,
        acceptedAt: true,
        completedAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    let nearby: any[] = [];
    const cutoffSeconds = 90;

    const fresh = isFresh(profile.lastSeenAt, cutoffSeconds);
    const canComputeNearby =
      includeNearby &&
      fresh &&
      String(profile.status || "").toUpperCase() === "AVAILABLE" &&
      typeof profile.lastSeenLat === "number" &&
      typeof profile.lastSeenLng === "number";

    if (canComputeNearby) {
      const lat = Number(profile.lastSeenLat);
      const lng = Number(profile.lastSeenLng);

      const latRad = (lat * Math.PI) / 180;
      const latDelta = radiusKm / 110.574;
      const lngDelta = radiusKm / (111.32 * Math.cos(latRad) || 1);

      const minLat = lat - latDelta;
      const maxLat = lat + latDelta;
      const minLng = lng - lngDelta;
      const maxLng = lng + lngDelta;

      const candidates = await requestModel.findMany({
        where: {
          status: { in: ["REQUESTED", "PENDING"] },
          carrierId: null,
          pickupLat: { gte: minLat, lte: maxLat },
          pickupLng: { gte: minLng, lte: maxLng },
        },
        take: 60,
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          status: true,
          type: true,
          requesterId: true,
          requesterUserId: true,
          productId: true,
          pickupLat: true,
          pickupLng: true,
          pickupLabel: true,
          pickupNear: true,
          contactPhone: true,
          note: true,
          createdAt: true,
        },
      });

      nearby = (Array.isArray(candidates) ? candidates : [])
        .map((r: any) => {
          const pLat = typeof r.pickupLat === "number" ? r.pickupLat : Number(r.pickupLat);
          const pLng = typeof r.pickupLng === "number" ? r.pickupLng : Number(r.pickupLng);
          if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) return null;

          const d = haversineKm(lat, lng, pLat, pLng);
          if (!Number.isFinite(d) || d > radiusKm) return null;

          return {
            id: String(r.id),
            status: String(r.status),
            type: String(r.type),
            requesterUserId:
              typeof r.requesterId === "string"
                ? r.requesterId
                : typeof r.requesterUserId === "string"
                  ? r.requesterUserId
                  : null,
            productId: typeof r.productId === "string" ? r.productId : null,
            pickup: {
              lat: pLat,
              lng: pLng,
              label:
                typeof r.pickupLabel === "string"
                  ? r.pickupLabel
                  : typeof r.pickupNear === "string"
                    ? r.pickupNear
                    : null,
            },
            contactPhone: typeof r.contactPhone === "string" ? r.contactPhone : null,
            note: typeof r.note === "string" ? r.note : null,
            createdAt: toIso(r.createdAt),
            distanceKm: Math.round(d * 100) / 100,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999))
        .slice(0, 20);
    }

    const normalizeAssigned = (r: any) => ({
      id: String(r.id),
      status: String(r.status),
      type: String(r.type),
      requesterUserId:
        typeof r.requesterId === "string"
          ? r.requesterId
          : typeof r.requesterUserId === "string"
            ? r.requesterUserId
            : null,
      carrierId: typeof r.carrierId === "string" ? r.carrierId : null,
      productId: typeof r.productId === "string" ? r.productId : null,
      pickup: {
        lat:
          typeof r.pickupLat === "number"
            ? r.pickupLat
            : r.pickupLat != null
              ? Number(r.pickupLat)
              : null,
        lng:
          typeof r.pickupLng === "number"
            ? r.pickupLng
            : r.pickupLng != null
              ? Number(r.pickupLng)
              : null,
        label:
          typeof r.pickupLabel === "string"
            ? r.pickupLabel
            : typeof r.pickupNear === "string"
              ? r.pickupNear
              : null,
      },
      dropoff:
        r.dropoffLat != null && r.dropoffLng != null
          ? {
              lat: typeof r.dropoffLat === "number" ? r.dropoffLat : Number(r.dropoffLat),
              lng: typeof r.dropoffLng === "number" ? r.dropoffLng : Number(r.dropoffLng),
              label: typeof r.dropoffLabel === "string" ? r.dropoffLabel : null,
            }
          : null,
      contactPhone: typeof r.contactPhone === "string" ? r.contactPhone : null,
      note: typeof r.note === "string" ? r.note : null,
      acceptedAt: toIso(r.acceptedAt),
      createdAt: toIso(r.createdAt),
      updatedAt: toIso(r.updatedAt),
      cancelledAt: toIso(r.cancelledAt),
      completedAt: toIso(r.completedAt),
    });

    log.info(
      {
        userId,
        carrierId,
        assigned: assigned.length,
        nearby: nearby.length,
        includeNearby,
      },
      "carrier_requests_ok",
    );

    return jsonNoStore({
      ok: true,
      hasProfile: true,
      carrierId,
      assigned: assigned.map(normalizeAssigned),
      nearby,
      nearbyMeta: {
        enabled: includeNearby,
        computed: canComputeNearby,
        radiusKm,
        freshnessCutoffSeconds: cutoffSeconds,
      },
    });
  });
}
