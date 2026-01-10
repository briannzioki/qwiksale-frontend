export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

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

function safeLog(log: any, level: "info" | "warn" | "error", ...args: any[]) {
  try {
    const fn = log?.[level];
    if (typeof fn === "function") fn(...args);
  } catch {
    // Logging must never crash the route.
  }
}

type AuthzUserLike = { id?: string | null; email?: string | null };

async function resolveAuthedUserId(u: AuthzUserLike): Promise<string | null> {
  const id = typeof u?.id === "string" ? u.id.trim() : "";
  if (id) return id;

  const email =
    typeof u?.email === "string" ? u.email.trim().toLowerCase() : "";
  if (!email) return null;

  const anyPrisma = prisma as any;
  const userModel = anyPrisma?.user;
  if (userModel && typeof userModel.findUnique === "function") {
    const row = await userModel
      .findUnique({ where: { email }, select: { id: true } })
      .catch(() => null);
    const uid =
      typeof row?.id === "string"
        ? row.id.trim()
        : row?.id
          ? String(row.id).trim()
          : "";
    if (uid) return uid;
  }

  return null;
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

function cleanStr(v: any, max: number) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

type Body = {
  phone?: string;

  vehicleType?: string;

  vehiclePlate?: string;
  plateNumber?: string;

  station?: { lat?: number; lng?: number; label?: string };

  stationLat?: number | string;
  stationLng?: number | string;

  lat?: number | string;
  lng?: number | string;

  stationLabel?: string;

  vehiclePhotoKeys?: string[];
  docPhotoKey?: string | null;
};

function parseBody(body: Body | null) {
  const phone = cleanStr(body?.phone, 30);

  const vehiclePlate = cleanStr(
    body?.vehiclePlate ?? (body as any)?.plateNumber,
    30,
  );

  const stationLat = toNum(
    body?.station?.lat ?? (body as any)?.stationLat ?? (body as any)?.lat,
  );
  const stationLng = toNum(
    body?.station?.lng ?? (body as any)?.stationLng ?? (body as any)?.lng,
  );

  const stationLabel = cleanStr(
    body?.station?.label ?? (body as any)?.stationLabel,
    140,
  );

  const vehicleType = cleanStr((body as any)?.vehicleType, 40);

  const vehiclePhotoKeys = Array.isArray(body?.vehiclePhotoKeys)
    ? body!.vehiclePhotoKeys
        .map((k) => (typeof k === "string" ? k.trim() : ""))
        .filter((k) => k.length > 0)
        .slice(0, 8)
    : [];

  const docPhotoKey =
    body?.docPhotoKey == null ? null : cleanStr(body.docPhotoKey, 240);

  return {
    phone,
    vehicleType,
    vehiclePlate,
    stationLat,
    stationLng,
    stationLabel,
    vehiclePhotoKeys,
    docPhotoKey,
  };
}

function isFutureDate(v: any) {
  if (!v) return false;
  const d = v instanceof Date ? v : new Date(String(v));
  const ms = d.getTime();
  return Number.isFinite(ms) && ms > Date.now();
}

type VehicleTypeEnum = "BICYCLE" | "MOTORBIKE" | "CAR" | "VAN" | "TRUCK";

function normalizeVehicleTypeEnum(raw: unknown): VehicleTypeEnum {
  const s = typeof raw === "string" ? raw.trim() : "";
  const t = s.toUpperCase();

  if (t === "BICYCLE" || t === "BIKE") return "BICYCLE";
  if (t === "MOTORBIKE" || t === "MOTORCYCLE" || t === "MOTO")
    return "MOTORBIKE";
  if (t === "CAR") return "CAR";
  if (t === "VAN") return "VAN";
  if (t === "TRUCK" || t === "LORRY") return "TRUCK";

  return "MOTORBIKE";
}

export async function POST(req: NextRequest) {
  const authz = await requireUser({
    mode: "result",
    callbackUrl: "/api/carrier/register",
  });
  if (!authz.authorized) return unauthorized(authz.reason);

  const userId = await resolveAuthedUserId(authz.user as any);
  if (!userId) return unauthorized();

  return withApiLogging(req, "/api/carrier/register", async (log: RequestLog) => {
    const anyPrisma = prisma as any;
    const carrierModel = anyPrisma?.carrierProfile;

    if (!carrierModel || typeof carrierModel.create !== "function") {
      return jsonNoStore(
        {
          error:
            "Carrier model is not available yet. Run the Prisma migration for CarrierProfile first.",
        },
        { status: 501 },
      );
    }

    const body = ((await readJson(req)) as Body | null) ?? ({} as Body);
    const parsed = parseBody(body);

    const now = new Date();

    // Determine whether this request intends to *change* anything.
    // E2E uses this endpoint as an "ensure exists" step, so empty bodies should be idempotent.
    const hasStation =
      typeof parsed.stationLat === "number" && typeof parsed.stationLng === "number";

    const wantsProfileUpdate =
      Boolean(parsed.phone) ||
      Boolean(parsed.docPhotoKey) ||
      Boolean(parsed.stationLabel) ||
      hasStation;

    const wantsVehicleUpdate =
      Boolean(parsed.vehicleType) ||
      Boolean(parsed.vehiclePlate) ||
      (Array.isArray(parsed.vehiclePhotoKeys) && parsed.vehiclePhotoKeys.length > 0);

    const wantsAnyUpdate = wantsProfileUpdate || wantsVehicleUpdate;

    let existing: any = null;

    // Try a rich select first (for better response); fall back to minimal if schema drift.
    const selectExistingRich = {
      id: true,
      bannedAt: true,
      bannedReason: true,
      suspendedUntil: true,
      status: true,
      planTier: true,
      verificationStatus: true,
      phone: true,
      stationLat: true,
      stationLng: true,
      stationLabel: true,
      createdAt: true,
      updatedAt: true,
    };

    const selectExistingMinimal = {
      id: true,
      bannedAt: true,
      bannedReason: true,
      suspendedUntil: true,
    };

    try {
      if (typeof carrierModel.findUnique === "function") {
        existing = await carrierModel.findUnique({
          where: { userId },
          select: selectExistingRich,
        });
      }
    } catch {
      existing = null;
    }

    if (!existing && typeof carrierModel.findUnique === "function") {
      try {
        existing = await carrierModel.findUnique({
          where: { userId },
          select: selectExistingMinimal,
        });
      } catch {
        existing = null;
      }
    }

    if (!existing && typeof carrierModel.findFirst === "function") {
      try {
        existing = await carrierModel.findFirst({
          where: { userId },
          select: selectExistingRich,
        });
      } catch {
        existing = null;
      }
    }

    if (!existing && typeof carrierModel.findFirst === "function") {
      try {
        existing = await carrierModel.findFirst({
          where: { userId },
          select: selectExistingMinimal,
        });
      } catch {
        existing = null;
      }
    }

    // ✅ KEY FIX (stronger):
    // If profile exists and is enforced (banned/suspended), NEVER 403 here.
    // This endpoint is used as an E2E "ensure exists" step, so it must be idempotent.
    // We do NOT write anything when enforced — we just return state.
    if (existing?.id) {
      const bannedAtIso = toIso(existing?.bannedAt);
      const suspendedUntilIso = toIso(existing?.suspendedUntil);

      const isBanned = Boolean(existing?.bannedAt);
      const isSuspended = isFutureDate(existing?.suspendedUntil);

      const baseProfile = {
        id: String(existing?.id ?? ""),
        userId: String(userId),
        status: typeof existing?.status === "string" ? existing.status : "OFFLINE",
        planTier: typeof existing?.planTier === "string" ? existing.planTier : "BASIC",
        verificationStatus:
          typeof existing?.verificationStatus === "string"
            ? existing.verificationStatus
            : "PENDING",
        phone: typeof existing?.phone === "string" ? existing.phone : null,
        vehicleType: "MOTORBIKE",
        vehiclePlate: null as string | null,
        station: {
          lat: typeof existing?.stationLat === "number" ? existing.stationLat : null,
          lng: typeof existing?.stationLng === "number" ? existing.stationLng : null,
          label: typeof existing?.stationLabel === "string" ? existing.stationLabel : null,
        },
        enforcement: {
          banned: isBanned,
          bannedAt: bannedAtIso,
          bannedReason:
            typeof existing?.bannedReason === "string" ? existing.bannedReason : null,
          suspended: isSuspended,
          suspendedUntil: suspendedUntilIso,
        },
        createdAt: toIso(existing?.createdAt),
        updatedAt: toIso(existing?.updatedAt),
      };

      if (isBanned || isSuspended) {
        // If the client tried to "update" while enforced, we still return OK but indicate it was blocked.
        return jsonNoStore({
          ok: true,
          alreadyRegistered: true,
          updateBlocked: wantsAnyUpdate,
          profile: baseProfile,
        });
      }

      // Not enforced: treat empty/no-op "register" calls as idempotent.
      if (!wantsAnyUpdate) {
        return jsonNoStore({
          ok: true,
          alreadyRegistered: true,
          profile: baseProfile,
        });
      }
    }

    // If we get here:
    // - Either no existing profile, or
    // - Existing profile is NOT enforced AND request wants updates.
    const createProfileData: any = {
      userId,
      status: "OFFLINE",
      planTier: "BASIC",
      verificationStatus: "PENDING",
      lastSeenAt: now,
      ...(parsed.phone ? { phone: parsed.phone } : {}),
      ...(parsed.docPhotoKey ? { docPhotoKey: parsed.docPhotoKey } : {}),
      ...(parsed.stationLabel ? { stationLabel: parsed.stationLabel } : {}),
      ...(hasStation
        ? { stationLat: parsed.stationLat, stationLng: parsed.stationLng }
        : {}),
    };

    const updateProfileData: any = {
      lastSeenAt: now,
      ...(parsed.phone ? { phone: parsed.phone } : {}),
      ...(parsed.docPhotoKey ? { docPhotoKey: parsed.docPhotoKey } : {}),
      ...(parsed.stationLabel ? { stationLabel: parsed.stationLabel } : {}),
      ...(hasStation
        ? { stationLat: parsed.stationLat, stationLng: parsed.stationLng }
        : {}),
    };

    const selectProfile = {
      id: true,
      userId: true,
      phone: true,
      status: true,
      planTier: true,
      verificationStatus: true,
      stationLat: true,
      stationLng: true,
      stationLabel: true,
      bannedAt: true,
      bannedReason: true,
      suspendedUntil: true,
      lastSeenAt: true,
      createdAt: true,
      updatedAt: true,
    };

    const tryUpsertProfile = async () => {
      if (typeof carrierModel.upsert !== "function") return null;
      return carrierModel.upsert({
        where: { userId },
        create: createProfileData,
        update: updateProfileData,
        select: selectProfile,
      });
    };

    const tryUpdateOrCreateProfile = async () => {
      if (existing?.id && typeof carrierModel.update === "function") {
        return carrierModel.update({
          where: { id: existing.id },
          data: updateProfileData,
          select: selectProfile,
        });
      }

      return carrierModel.create({
        data: createProfileData,
        select: selectProfile,
      });
    };

    let savedProfile: any = null;

    try {
      savedProfile =
        (await tryUpsertProfile()) ?? (await tryUpdateOrCreateProfile());
    } catch (e: any) {
      safeLog(
        log,
        "error",
        { err: String(e?.message ?? e) },
        "carrier_register_failed",
      );
      return jsonNoStore(
        { error: "Failed to register carrier profile." },
        { status: 500 },
      );
    }

    let savedVehicle: any = null;
    try {
      const vehicleModel = anyPrisma?.carrierVehicle;
      if (vehicleModel && typeof vehicleModel.findFirst === "function") {
        const typeEnum: VehicleTypeEnum = normalizeVehicleTypeEnum(
          parsed.vehicleType,
        );

        savedVehicle = await vehicleModel.findFirst({
          where: { carrierId: savedProfile.id },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            type: true,
            registration: true,
            photoKeys: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        const wantsVehicleUpdate2 =
          Boolean(parsed.vehicleType) ||
          Boolean(parsed.vehiclePlate) ||
          (Array.isArray(parsed.vehiclePhotoKeys) &&
            parsed.vehiclePhotoKeys.length > 0);

        if (!savedVehicle && typeof vehicleModel.create === "function") {
          savedVehicle = await vehicleModel.create({
            data: {
              carrierId: savedProfile.id,
              type: typeEnum,
              ...(parsed.vehiclePlate
                ? { registration: parsed.vehiclePlate }
                : {}),
              ...(parsed.vehiclePhotoKeys.length
                ? { photoKeys: parsed.vehiclePhotoKeys }
                : {}),
            },
            select: {
              id: true,
              type: true,
              registration: true,
              photoKeys: true,
              createdAt: true,
              updatedAt: true,
            },
          });
        } else if (
          savedVehicle &&
          wantsVehicleUpdate2 &&
          typeof vehicleModel.update === "function"
        ) {
          const updateVehicleData: any = {};
          if (parsed.vehicleType) updateVehicleData.type = typeEnum;
          if (parsed.vehiclePlate)
            updateVehicleData.registration = parsed.vehiclePlate;
          if (parsed.vehiclePhotoKeys.length)
            updateVehicleData.photoKeys = parsed.vehiclePhotoKeys;

          if (Object.keys(updateVehicleData).length) {
            savedVehicle = await vehicleModel.update({
              where: { id: savedVehicle.id },
              data: updateVehicleData,
              select: {
                id: true,
                type: true,
                registration: true,
                photoKeys: true,
                createdAt: true,
                updatedAt: true,
              },
            });
          }
        }
      }
    } catch (e: any) {
      safeLog(
        log,
        "warn",
        { err: String(e?.message ?? e) },
        "carrier_register_vehicle_best_effort_failed",
      );
      savedVehicle = null;
    }

    const payload = {
      id: String(savedProfile?.id ?? ""),
      userId: String(savedProfile?.userId ?? userId),
      status: String(savedProfile?.status ?? "OFFLINE"),
      planTier: String(savedProfile?.planTier ?? "BASIC"),
      verificationStatus: String(savedProfile?.verificationStatus ?? "PENDING"),
      phone:
        typeof savedProfile?.phone === "string" ? savedProfile.phone : parsed.phone,
      vehicleType: savedVehicle?.type
        ? String(savedVehicle.type)
        : parsed.vehicleType ?? "MOTORBIKE",
      vehiclePlate:
        typeof savedVehicle?.registration === "string"
          ? savedVehicle.registration
          : parsed.vehiclePlate ?? null,
      station: {
        lat:
          typeof savedProfile?.stationLat === "number"
            ? savedProfile.stationLat
            : parsed.stationLat,
        lng:
          typeof savedProfile?.stationLng === "number"
            ? savedProfile.stationLng
            : parsed.stationLng,
        label:
          typeof savedProfile?.stationLabel === "string"
            ? savedProfile.stationLabel
            : parsed.stationLabel,
      },
      enforcement: {
        banned: Boolean(savedProfile?.bannedAt),
        bannedAt: toIso(savedProfile?.bannedAt),
        bannedReason:
          typeof savedProfile?.bannedReason === "string"
            ? savedProfile.bannedReason
            : null,
        suspended: isFutureDate(savedProfile?.suspendedUntil),
        suspendedUntil: toIso(savedProfile?.suspendedUntil),
      },
      createdAt: toIso(savedProfile?.createdAt),
      updatedAt: toIso(savedProfile?.updatedAt),
    };

    safeLog(
      log,
      "info",
      { userId, carrierId: payload.id },
      "carrier_register_ok",
    );

    return jsonNoStore({
      ok: true,
      profile: payload,
    });
  });
}
