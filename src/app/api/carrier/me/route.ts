// src/app/api/carrier/me/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { withApiLogging, type RequestLog } from "@/app/lib/api-logging";

function jsonNoStore(payload: unknown, init?: ResponseInit) {
  const res = NextResponse.json(payload, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  res.headers.set("X-Carrier-Me-Version", "carrier.me.v8-vehicles-source-of-truth");
  return res;
}

function unauthorized(message = "Unauthorized") {
  return jsonNoStore({ error: message }, { status: 401 });
}

const VERBOSE =
  process.env["E2E_VERBOSE_ERRORS"] === "1" || process.env.NODE_ENV !== "production";

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

function parseMaybeInt(v: string): number | null {
  const s = String(v || "").trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function pickCarrierModel(anyPrisma: any) {
  return anyPrisma?.carrierProfile ?? null;
}

async function bestEffortLatestVehicle(anyPrisma: any, carrierId: string) {
  try {
    const vehicleModel = anyPrisma?.carrierVehicle;
    if (vehicleModel && typeof vehicleModel.findFirst === "function") {
      const cidInt = parseMaybeInt(carrierId);
      const where = cidInt != null ? { carrierId: cidInt } : { carrierId };

      return await vehicleModel
        .findFirst({
          where,
          orderBy: { createdAt: "desc" },
          select: { type: true, registration: true },
        })
        .catch(() => null);
    }
  } catch {
    // ignore
  }
  return null;
}

async function resolveSessionIdentity(): Promise<{ id: string | null; email: string | null; name: string | null }> {
  try {
    const session = await auth();
    const userAny: any = (session as any)?.user ?? null;
    if (!userAny) return { id: null, email: null, name: null };

    const rawId = userAny?.id != null ? String(userAny.id).trim() : "";
    const rawEmail = typeof userAny?.email === "string" ? userAny.email.trim().toLowerCase() : "";
    const rawName = typeof userAny?.name === "string" ? userAny.name : null;

    let id: string | null = rawId || null;
    const email: string | null = rawEmail || null;

    const shouldReconcile =
      !!email &&
      (process.env["NEXT_PUBLIC_E2E"] === "1" ||
        process.env["E2E"] === "1" ||
        process.env.NODE_ENV !== "production" ||
        !id ||
        id === "undefined" ||
        id === "null");

    if (shouldReconcile && email) {
      try {
        const row = await (prisma as any)?.user?.findUnique?.({
          where: { email },
          select: { id: true, name: true, email: true },
        });

        const dbId =
          typeof row?.id === "string"
            ? row.id.trim()
            : row?.id != null
              ? String(row.id).trim()
              : "";

        if (dbId) id = dbId;

        const n = typeof row?.name === "string" ? row.name : rawName;
        const e = typeof row?.email === "string" ? row.email.trim().toLowerCase() : email;

        return { id, email: e ?? null, name: n };
      } catch {
        // ignore
      }
    }

    return { id, email, name: rawName };
  } catch {
    return { id: null, email: null, name: null };
  }
}

async function findCarrierForUser(anyPrisma: any, userId: string, email: string | null) {
  const carrierModel = pickCarrierModel(anyPrisma);
  if (!carrierModel) return null;

  const selectFull = {
    id: true,
    userId: true,
    phone: true,

    stationLat: true,
    stationLng: true,
    stationLabel: true,

    planTier: true,
    verificationStatus: true,
    status: true,

    bannedAt: true,
    bannedReason: true,
    suspendedUntil: true,

    lastSeenAt: true,
    lastSeenLat: true,
    lastSeenLng: true,

    createdAt: true,
    updatedAt: true,

    user: { select: { name: true, email: true } },
  };

  const userIdAsInt = parseMaybeInt(userId);

  // 1) by userId
  if (typeof carrierModel.findUnique === "function") {
    try {
      return await carrierModel.findUnique({ where: { userId }, select: selectFull });
    } catch {
      // ignore
    }
    if (userIdAsInt != null) {
      try {
        return await carrierModel.findUnique({ where: { userId: userIdAsInt }, select: selectFull });
      } catch {
        // ignore
      }
    }
  }

  if (typeof carrierModel.findFirst === "function") {
    try {
      const byId = await carrierModel.findFirst({ where: { userId }, select: selectFull });
      if (byId) return byId;
    } catch {
      // ignore
    }
    if (userIdAsInt != null) {
      try {
        const byInt = await carrierModel.findFirst({ where: { userId: userIdAsInt }, select: selectFull });
        if (byInt) return byInt;
      } catch {
        // ignore
      }
    }
  }

  // 2) fallback by relation email (if relation exists)
  if (email && typeof carrierModel.findFirst === "function") {
    try {
      const byEmail = await carrierModel.findFirst({
        where: { user: { email } },
        select: selectFull,
      });
      if (byEmail) return byEmail;
    } catch {
      // ignore
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  const ident = await resolveSessionIdentity();
  if (!ident.id) return unauthorized();

  const userId: string = ident.id;
  const email: string | null = ident.email;
  const name: string | null = ident.name;

  return withApiLogging(req, "/api/carrier/me", async (log: RequestLog) => {
    const anyPrisma = prisma as any;

    const carrierModel = pickCarrierModel(anyPrisma);
    if (!carrierModel) {
      return jsonNoStore(
        { error: "Carrier model is not available yet. Run the Prisma migration for CarrierProfile first." },
        { status: 501 },
      );
    }

    const profile = await findCarrierForUser(anyPrisma, userId, email);

    if (!profile) {
      log.info({ userId, email: email ?? null }, "carrier_me_none");
      return jsonNoStore({
        ok: true,
        hasProfile: false,
        carrier: null,
        bannedAt: null,
        bannedReason: null,
        suspendedUntil: null,
        ...(VERBOSE ? { debug: { userId, email: email ?? null } } : {}),
      });
    }

    const enf = {
      banned: Boolean(profile?.bannedAt),
      bannedAt: toIso(profile?.bannedAt),
      bannedReason: typeof profile?.bannedReason === "string" ? profile.bannedReason : null,
      suspended: isFuture(profile?.suspendedUntil),
      suspendedUntil: toIso(profile?.suspendedUntil),
    };

    const vehicleFallback = await bestEffortLatestVehicle(anyPrisma, String(profile.id));

    const carrier = {
      id: String(profile?.id ?? ""),
      userId: String(profile?.userId ?? userId),
      user: {
        name:
          typeof profile?.user?.name === "string" ? profile.user.name : typeof name === "string" ? name : null,
        email:
          typeof profile?.user?.email === "string"
            ? String(profile.user.email).trim().toLowerCase()
            : email ?? null,
      },

      phone: typeof profile?.phone === "string" ? profile.phone : null,

      // ✅ vehicles are the source of truth
      vehicleType: vehicleFallback?.type != null ? String(vehicleFallback.type) : null,
      vehiclePlate: vehicleFallback?.registration != null ? String(vehicleFallback.registration) : null,

      station: {
        lat: typeof profile?.stationLat === "number" ? profile.stationLat : profile?.stationLat != null ? Number(profile.stationLat) : null,
        lng: typeof profile?.stationLng === "number" ? profile.stationLng : profile?.stationLng != null ? Number(profile.stationLng) : null,
        label: typeof profile?.stationLabel === "string" ? profile.stationLabel : null,
      },

      planTier: String(profile?.planTier ?? "BASIC"),
      verificationStatus: String(profile?.verificationStatus ?? "UNVERIFIED"),
      status: String(profile?.status ?? "OFFLINE"),

      bannedAt: enf.bannedAt,
      bannedReason: enf.bannedReason,
      suspendedUntil: enf.suspendedUntil,
      enforcement: enf,

      lastSeen: {
        at: toIso(profile?.lastSeenAt),
        lat: typeof profile?.lastSeenLat === "number" ? profile.lastSeenLat : profile?.lastSeenLat != null ? Number(profile.lastSeenLat) : null,
        lng: typeof profile?.lastSeenLng === "number" ? profile.lastSeenLng : profile?.lastSeenLng != null ? Number(profile.lastSeenLng) : null,
      },

      createdAt: toIso(profile?.createdAt),
      updatedAt: toIso(profile?.updatedAt),
    };

    log.info({ userId, carrierId: carrier.id, banned: enf.banned, email: email ?? null }, "carrier_me_ok");

    return jsonNoStore({
      ok: true,
      hasProfile: true,
      carrier,
      bannedAt: carrier.bannedAt,
      bannedReason: carrier.bannedReason,
      suspendedUntil: carrier.suspendedUntil,
      ...(VERBOSE ? { debug: { userId, email: email ?? null } } : {}),
    });
  });
}
