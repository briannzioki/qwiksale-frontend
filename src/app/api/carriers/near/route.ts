// src/app/api/carriers/near/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { withApiLogging, type RequestLog } from "@/app/lib/api-logging";
import { requireUser } from "@/app/lib/authz";

/** tiny helper to ensure proper caching/vary on all JSON */
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

function unauthorized(message = "Unauthorized") {
  return jsonNoStore({ error: message }, { status: 401 });
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function toNum(v: string | null) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

function isFresh(lastSeenAt: Date | null | undefined, cutoffSeconds: number) {
  if (!lastSeenAt) return false;
  const ms = lastSeenAt.getTime();
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms <= cutoffSeconds * 1000;
}

function tierRank(tier: string) {
  const t = String(tier || "").toUpperCase();
  if (t === "PLATINUM") return 3;
  if (t === "GOLD") return 2;
  return 1;
}

type CarrierVehicleType = "BICYCLE" | "MOTORBIKE" | "CAR" | "VAN" | "TRUCK";

function normalizeVehicleType(raw: string): CarrierVehicleType | null {
  const t = String(raw || "").trim().toUpperCase();
  if (t === "BICYCLE" || t === "BIKE") return "BICYCLE";
  if (t === "MOTORBIKE" || t === "MOTORCYCLE" || t === "MOTO") return "MOTORBIKE";
  if (t === "CAR") return "CAR";
  if (t === "VAN") return "VAN";
  if (t === "TRUCK" || t === "LORRY") return "TRUCK";
  return null;
}

type CarrierCard = {
  carrierId: string;
  userId: string;
  name: string | null;
  planTier: "BASIC" | "GOLD" | "PLATINUM";
  verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  status: "OFFLINE" | "AVAILABLE" | "ON_TRIP";
  vehicleType: string | null;

  distanceKm: number;
  lastSeenAt: string | null;
  isLive: boolean;
  isStale: boolean;

  location: null | {
    lat: number;
    lng: number;
    updatedAt: string;
  };
};

export async function GET(req: NextRequest) {
  const authz = await requireUser({ mode: "result", callbackUrl: "/api/carriers/near" });
  if (!authz.authorized) return unauthorized(authz.reason);

  const authedUserId = authz.user.id;

  return withApiLogging(req, "/api/carriers/near", async (log: RequestLog) => {
    const url = new URL(req.url);

    const lat = toNum(url.searchParams.get("lat"));
    const lng = toNum(url.searchParams.get("lng"));
    const radiusKmRaw = toNum(url.searchParams.get("radiusKm"));

    const vehicleTypeRaw = (url.searchParams.get("vehicleType") || "").trim();
    const productId = (url.searchParams.get("productId") || "").trim();

    if (lat == null || lng == null || radiusKmRaw == null) {
      return badRequest("Missing required query params: lat,lng,radiusKm", {
        expected: { lat: "number", lng: "number", radiusKm: "number" },
      });
    }

    const safeLat = clamp(lat, -90, 90);
    const safeLng = clamp(lng, -180, 180);
    const radiusKm = clamp(radiusKmRaw, 0.5, 50);

    const cutoffSeconds = 90;
    const now = new Date();

    const anyPrisma = prisma as any;
    const carrierModel = anyPrisma?.carrierProfile;

    if (!carrierModel || typeof carrierModel.findMany !== "function") {
      return jsonNoStore(
        {
          error:
            "Carrier model is not available yet. Run the Prisma migration for CarrierProfile first.",
        },
        { status: 501 },
      );
    }

    const latRad = (safeLat * Math.PI) / 180;
    const latDelta = radiusKm / 110.574;
    const lngDelta = radiusKm / (111.32 * Math.cos(latRad) || 1);

    const minLat = safeLat - latDelta;
    const maxLat = safeLat + latDelta;
    const minLng = safeLng - lngDelta;
    const maxLng = safeLng + lngDelta;

    const baseWhere: any = {
      bannedAt: null,
      OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: now } }],
      status: "AVAILABLE",
      lastSeenLat: { gte: minLat, lte: maxLat },
      lastSeenLng: { gte: minLng, lte: maxLng },
    };

    // ✅ vehicle filter must go through CarrierVehicle relation
    const vt = normalizeVehicleType(vehicleTypeRaw);
    if (vt) {
      baseWhere.vehicles = { some: { type: vt } };
    }

    const select = {
      id: true,
      userId: true,
      planTier: true,
      verificationStatus: true,
      status: true,
      lastSeenAt: true,
      lastSeenLat: true,
      lastSeenLng: true,
      user: { select: { name: true } },
      // ✅ latest vehicle (type+registration) comes from relation
      vehicles: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: { type: true, registration: true },
      },
    };

    let raw: any[] = [];
    try {
      raw = await carrierModel.findMany({
        where: baseWhere,
        take: 300,
        orderBy: [{ planTier: "desc" }, { lastSeenAt: "desc" }],
        select,
      });
    } catch (e: any) {
      log.warn({ err: String(e?.message ?? e) }, "carriers_near_query_failed");
      return jsonNoStore({ error: "Failed to query carriers." }, { status: 500 });
    }

    const cards: CarrierCard[] = (Array.isArray(raw) ? raw : [])
      .map((c) => {
        const lastSeenAt =
          c?.lastSeenAt instanceof Date ? c.lastSeenAt : c?.lastSeenAt ? new Date(c.lastSeenAt) : null;

        const lastSeenLat = typeof c?.lastSeenLat === "number" ? c.lastSeenLat : Number(c?.lastSeenLat);
        const lastSeenLng = typeof c?.lastSeenLng === "number" ? c.lastSeenLng : Number(c?.lastSeenLng);

        if (!Number.isFinite(lastSeenLat) || !Number.isFinite(lastSeenLng)) return null;

        const dist = haversineKm(safeLat, safeLng, lastSeenLat, lastSeenLng);
        if (!Number.isFinite(dist) || dist > radiusKm) return null;

        const planTierRaw = String(c?.planTier ?? "BASIC").toUpperCase();
        const verificationRaw = String(c?.verificationStatus ?? "UNVERIFIED").toUpperCase();
        const statusRaw = String(c?.status ?? "OFFLINE").toUpperCase();

        const planTier =
          planTierRaw === "PLATINUM" ? "PLATINUM" : planTierRaw === "GOLD" ? "GOLD" : "BASIC";

        const verificationStatus =
          verificationRaw === "VERIFIED"
            ? "VERIFIED"
            : verificationRaw === "PENDING"
              ? "PENDING"
              : verificationRaw === "REJECTED"
                ? "REJECTED"
                : "UNVERIFIED";

        const status =
          statusRaw === "AVAILABLE" ? "AVAILABLE" : statusRaw === "ON_TRIP" ? "ON_TRIP" : "OFFLINE";

        const fresh = isFresh(lastSeenAt, cutoffSeconds);

        const latestVehicle = Array.isArray(c?.vehicles) ? c.vehicles[0] : null;
        const vehicleTypeOut =
          latestVehicle?.type != null ? String(latestVehicle.type) : null;

        return {
          carrierId: String(c?.id ?? ""),
          userId: String(c?.userId ?? ""),
          name: typeof c?.user?.name === "string" ? c.user.name : null,
          planTier,
          verificationStatus,
          status,
          vehicleType: vehicleTypeOut,
          distanceKm: Math.round(dist * 100) / 100,
          lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
          isLive: fresh,
          isStale: !fresh,
          location: fresh
            ? {
                lat: lastSeenLat,
                lng: lastSeenLng,
                updatedAt: lastSeenAt ? lastSeenAt.toISOString() : new Date().toISOString(),
              }
            : null,
        } as CarrierCard;
      })
      .filter(Boolean) as CarrierCard[];

    cards.sort((a, b) => {
      const t = tierRank(b.planTier) - tierRank(a.planTier);
      if (t !== 0) return t;

      const d = a.distanceKm - b.distanceKm;
      if (d !== 0) return d;

      const at = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
      const bt = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
      return bt - at;
    });

    log.info(
      {
        userId: authedUserId,
        query: {
          lat: safeLat,
          lng: safeLng,
          radiusKm,
          vehicleType: vt ?? null,
          productId: productId || null,
        },
        returned: cards.length,
        cutoffSeconds,
      },
      "carriers_near_ok",
    );

    return jsonNoStore({
      query: {
        lat: safeLat,
        lng: safeLng,
        radiusKm,
        vehicleType: vt ?? null,
        productId: productId || null,
      },
      freshness: { cutoffSeconds, strategy: "include-stale-rank-lower" },
      results: cards,
    });
  });
}
