// src/app/api/admin/carriers/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { assertAdmin } from "../_lib/guard";
import { withApiLogging, type RequestLog } from "@/app/lib/api-logging";

/** tiny helper to ensure proper caching/vary on all JSON */
function jsonNoStore(payload: unknown, init?: ResponseInit) {
  const res = NextResponse.json(payload, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  res.headers.set("Vary", "Authorization, Cookie, Accept-Encoding");
  return res;
}

function toInt(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function cleanStr(v: string | null, max = 80) {
  if (!v) return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
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

const VEHICLE_TYPES = new Set(["BICYCLE", "MOTORBIKE", "CAR", "VAN", "TRUCK"]);

export async function GET(req: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;

  return withApiLogging(req, "/api/admin/carriers", async (log: RequestLog) => {
    const url = new URL(req.url);

    const q = cleanStr(url.searchParams.get("q"), 120) ?? cleanStr(url.searchParams.get("email"), 120);

    const status = cleanStr(url.searchParams.get("status"), 30);
    const planTier = cleanStr(url.searchParams.get("tier"), 30);
    const verificationStatus = cleanStr(url.searchParams.get("verification"), 30);

    const enforcement = (cleanStr(url.searchParams.get("enforcement"), 30) || "").toLowerCase();
    const onlyBanned = enforcement === "banned";
    const onlySuspended = enforcement === "suspended";
    const onlyClear = enforcement === "clear";

    const sort = (cleanStr(url.searchParams.get("sort"), 30) || "updated").toLowerCase();
    const page = clamp(toInt(url.searchParams.get("page"), 1), 1, 5000);
    const pageSize = clamp(toInt(url.searchParams.get("pageSize"), 50), 1, 200);

    const now = new Date();

    const where: any = {};

    if (status) where.status = String(status).toUpperCase();
    if (planTier) where.planTier = String(planTier).toUpperCase();
    if (verificationStatus) where.verificationStatus = String(verificationStatus).toUpperCase();

    if (onlyBanned) {
      where.bannedAt = { not: null };
    } else if (onlySuspended) {
      where.suspendedUntil = { gt: now };
    } else if (onlyClear) {
      where.bannedAt = null;
      where.OR = [{ suspendedUntil: null }, { suspendedUntil: { lte: now } }];
    }

    if (q) {
      const qUpper = String(q).trim().toUpperCase();

      const or: any[] = [
        { phone: { contains: q, mode: "insensitive" } },
        { userId: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        { user: { name: { contains: q, mode: "insensitive" } } },
        { vehicles: { some: { registration: { contains: q, mode: "insensitive" } } } },
      ];

      if (VEHICLE_TYPES.has(qUpper)) {
        or.push({ vehicles: { some: { type: qUpper } } });
      }

      where.OR = Array.isArray(where.OR) ? [...where.OR, ...or] : or;
    }

    const orderBy =
      sort === "lastseen"
        ? [{ lastSeenAt: "desc" }, { updatedAt: "desc" }]
        : sort === "created"
          ? [{ createdAt: "desc" }]
          : [{ updatedAt: "desc" }];

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const anyPrisma = prisma as any;
    const carrierModel = anyPrisma?.carrierProfile;

    if (!carrierModel || typeof carrierModel.findMany !== "function") {
      return jsonNoStore(
        { error: "Carrier model is not available yet. Run the Prisma migration for CarrierProfile first." },
        { status: 501 },
      );
    }

    let rows: any[] = [];
    let total = 0;

    try {
      const [r, c] = await Promise.all([
        carrierModel.findMany({
          where,
          orderBy,
          skip,
          take,
          select: {
            id: true,
            userId: true,
            phone: true,

            status: true,
            planTier: true,
            verificationStatus: true,

            bannedAt: true,
            bannedReason: true,
            suspendedUntil: true,

            lastSeenAt: true,
            lastSeenLat: true,
            lastSeenLng: true,

            stationLabel: true,
            stationLat: true,
            stationLng: true,

            createdAt: true,
            updatedAt: true,

            user: { select: { id: true, name: true, email: true } },

            vehicles: {
              take: 1,
              orderBy: { createdAt: "desc" },
              select: { type: true, registration: true },
            },
          },
        }),
        typeof carrierModel.count === "function" ? carrierModel.count({ where }) : Promise.resolve(0),
      ]);

      rows = Array.isArray(r) ? r : [];
      total = Number.isFinite(c) ? c : rows.length;
    } catch (e: any) {
      log.error({ err: String(e?.message ?? e) }, "admin_carriers_list_failed");
      return jsonNoStore({ error: "Failed to load carriers." }, { status: 500 });
    }

    const items = rows.map((row: any) => {
      const v0 = Array.isArray(row?.vehicles) ? row.vehicles[0] : null;

      const vehicleType =
        typeof v0?.type === "string" ? v0.type : v0?.type != null ? String(v0.type) : null;

      const vehiclePlate =
        typeof v0?.registration === "string"
          ? v0.registration
          : v0?.registration != null
            ? String(v0.registration)
            : null;

      const bannedAt = toIso(row?.bannedAt);
      const suspendedUntil = toIso(row?.suspendedUntil);

      return {
        id: String(row?.id ?? ""),
        userId: typeof row?.userId === "string" ? row.userId : row?.userId != null ? String(row.userId) : null,

        user: {
          name: typeof row?.user?.name === "string" ? row.user.name : null,
          email: typeof row?.user?.email === "string" ? row.user.email : null,
        },

        phone: typeof row?.phone === "string" ? row.phone : row?.phone != null ? String(row.phone) : null,

        vehicleType,
        vehiclePlate,

        planTier: String(row?.planTier ?? "BASIC"),
        verificationStatus: String(row?.verificationStatus ?? "UNVERIFIED"),
        status: String(row?.status ?? "OFFLINE"),

        enforcement: {
          banned: Boolean(bannedAt),
          bannedAt,
          bannedReason: typeof row?.bannedReason === "string" ? row.bannedReason : row?.bannedReason != null ? String(row.bannedReason) : null,
          suspended: isFuture(row?.suspendedUntil),
          suspendedUntil,
        },

        lastSeen: {
          at: toIso(row?.lastSeenAt),
          lat: typeof row?.lastSeenLat === "number" ? row.lastSeenLat : row?.lastSeenLat != null ? Number(row.lastSeenLat) : null,
          lng: typeof row?.lastSeenLng === "number" ? row.lastSeenLng : row?.lastSeenLng != null ? Number(row.lastSeenLng) : null,
        },

        station: {
          lat: typeof row?.stationLat === "number" ? row.stationLat : row?.stationLat != null ? Number(row.stationLat) : null,
          lng: typeof row?.stationLng === "number" ? row.stationLng : row?.stationLng != null ? Number(row.stationLng) : null,
          label: typeof row?.stationLabel === "string" ? row.stationLabel : row?.stationLabel != null ? String(row.stationLabel) : null,
        },

        createdAt: toIso(row?.createdAt),
        updatedAt: toIso(row?.updatedAt),
      };
    });

    const bannedCount = items.filter((i: any) => i?.enforcement?.banned).length;
    const suspendedCount = items.filter((i: any) => i?.enforcement?.suspended).length;
    const availableCount = items.filter((i: any) => String(i?.status || "").toUpperCase() === "AVAILABLE").length;

    log.info(
      { total, returned: items.length, page, pageSize, filters: { status, planTier, verificationStatus, enforcement, q } },
      "admin_carriers_list_ok",
    );

    return jsonNoStore({
      ok: true,
      page,
      pageSize,
      total,
      items,
      summary: {
        returned: items.length,
        available: availableCount,
        banned: bannedCount,
        suspended: suspendedCount,
      },
    });
  });
}
