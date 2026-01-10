/**
 * Carrier shared utilities
 * - enforcement checks (banned/suspended)
 * - freshness cutoff helpers (live within 90s)
 * - ranking (tier -> distance -> lastSeenAt)
 *
 * Notes for callers:
 * - This module is intentionally dependency-free to avoid build breaks if geo helpers move.
 * - If your repo has kenya-geo / kenyaLocation helpers you prefer, you can swap `distanceKmHaversine`
 *   at the call site without changing the ranking/enforcement logic.
 */

export const CARRIER_FRESHNESS_CUTOFF_SECONDS = 90;

export type CarrierPlanTier = "BASIC" | "GOLD" | "PLATINUM" | (string & {});
export type CarrierVerificationStatus =
  | "UNVERIFIED"
  | "PENDING"
  | "VERIFIED"
  | "REJECTED"
  | (string & {});
export type CarrierStatus = "OFFLINE" | "AVAILABLE" | "ON_TRIP" | (string & {});

export type LatLng = {
  lat: number;
  lng: number;
};

export type CarrierEnforcementFields = {
  bannedAt?: Date | string | null;
  bannedReason?: string | null;
  suspendedUntil?: Date | string | null;
};

export type CarrierPresenceFields = {
  status?: CarrierStatus | string | null;
  lastSeenAt?: Date | string | null;
  lastSeenLat?: number | null;
  lastSeenLng?: number | null;
};

export type CarrierRankingFields = {
  planTier?: CarrierPlanTier | string | null;
  distanceKm: number;
  lastSeenAt?: Date | string | null;
};

export type CarrierEligibilityPolicy = {
  requireAvailable?: boolean;
  requireNotBanned?: boolean;
  requireNotSuspended?: boolean;
  requireFresh?: boolean;
};

export type CarrierEligibilityResult =
  | { ok: true }
  | { ok: false; reason: "BANNED" | "SUSPENDED" | "NOT_AVAILABLE" | "STALE" | "MISSING_LOCATION" };

export function safeParseDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) {
    const ms = v.getTime();
    return Number.isFinite(ms) ? v : null;
  }
  if (typeof v === "number") {
    const d = new Date(v);
    const ms = d.getTime();
    return Number.isFinite(ms) ? d : null;
  }
  if (typeof v === "string") {
    const d = new Date(v);
    const ms = d.getTime();
    return Number.isFinite(ms) ? d : null;
  }
  return null;
}

export function isCarrierBanned(fields: CarrierEnforcementFields, now = new Date()): boolean {
  const bannedAt = safeParseDate(fields?.bannedAt);
  if (!bannedAt) return false;
  // If bannedAt exists, consider it banned until explicitly cleared.
  // We do not auto-expire bans.
  void now;
  return true;
}

export function isCarrierSuspended(fields: CarrierEnforcementFields, now = new Date()): boolean {
  const until = safeParseDate(fields?.suspendedUntil);
  if (!until) return false;
  return until.getTime() > now.getTime();
}

export function carrierFreshness(
  lastSeenAt: Date | string | null | undefined,
  now = new Date(),
  cutoffSeconds = CARRIER_FRESHNESS_CUTOFF_SECONDS
): { isLive: boolean; ageSeconds: number | null } {
  const d = safeParseDate(lastSeenAt);
  if (!d) return { isLive: false, ageSeconds: null };
  const ageMs = now.getTime() - d.getTime();
  if (!Number.isFinite(ageMs)) return { isLive: false, ageSeconds: null };
  const ageSeconds = Math.max(0, Math.round(ageMs / 1000));
  return { isLive: ageSeconds <= cutoffSeconds, ageSeconds };
}

export function hasValidLatLng(lat: unknown, lng: unknown): lat is number {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

/**
 * Default eligibility policy for "nearby carriers" results.
 * We choose to exclude stale carriers from near results (requireFresh: true),
 * so the UI stays honest and avoids showing inactive drivers.
 */
export const DEFAULT_NEAR_ELIGIBILITY_POLICY: Required<CarrierEligibilityPolicy> = {
  requireAvailable: true,
  requireNotBanned: true,
  requireNotSuspended: true,
  requireFresh: true,
};

export function carrierEligibilityForNear(
  fields: CarrierEnforcementFields & CarrierPresenceFields,
  now = new Date(),
  policy: CarrierEligibilityPolicy = DEFAULT_NEAR_ELIGIBILITY_POLICY
): CarrierEligibilityResult {
  const p: Required<CarrierEligibilityPolicy> = {
    requireAvailable: policy.requireAvailable ?? true,
    requireNotBanned: policy.requireNotBanned ?? true,
    requireNotSuspended: policy.requireNotSuspended ?? true,
    requireFresh: policy.requireFresh ?? true,
  };

  if (p.requireNotBanned && isCarrierBanned(fields, now)) return { ok: false, reason: "BANNED" };
  if (p.requireNotSuspended && isCarrierSuspended(fields, now)) return { ok: false, reason: "SUSPENDED" };

  const status = String(fields?.status ?? "").toUpperCase();
  if (p.requireAvailable && status !== "AVAILABLE") return { ok: false, reason: "NOT_AVAILABLE" };

  if (!hasValidLatLng(fields?.lastSeenLat, fields?.lastSeenLng)) {
    return { ok: false, reason: "MISSING_LOCATION" };
  }

  if (p.requireFresh) {
    const fres = carrierFreshness(fields?.lastSeenAt ?? null, now);
    if (!fres.isLive) return { ok: false, reason: "STALE" };
  }

  return { ok: true };
}

export function tierScore(tier: CarrierPlanTier | string | null | undefined): number {
  const t = String(tier ?? "").toUpperCase();
  if (t === "PLATINUM") return 3;
  if (t === "GOLD") return 2;
  if (t === "BASIC") return 1;
  return 0;
}

/**
 * Ranking order required by spec:
 * planTier (PLATINUM > GOLD > BASIC) then distance asc then lastSeenAt most recent.
 */
export function rankCarriers<T extends CarrierRankingFields>(items: readonly T[], now = new Date()): T[] {
  const list = Array.isArray(items) ? [...items] : [];

  list.sort((a, b) => {
    const ta = tierScore(a.planTier);
    const tb = tierScore(b.planTier);
    if (ta !== tb) return tb - ta;

    const da = Number.isFinite(a.distanceKm) ? a.distanceKm : Number.POSITIVE_INFINITY;
    const db = Number.isFinite(b.distanceKm) ? b.distanceKm : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;

    const sa = safeParseDate(a.lastSeenAt)?.getTime() ?? 0;
    const sb = safeParseDate(b.lastSeenAt)?.getTime() ?? 0;

    // Most recent first
    return sb - sa;
  });

  // Touch `now` so callers can pass consistent time for multi-step pipelines.
  void now;

  return list;
}

/**
 * Haversine distance in km.
 * This is kept here to avoid a hard dependency on optional geo helpers.
 */
export function distanceKmHaversine(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * (sinDLng * sinDLng);

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  const km = R * c;

  return Number.isFinite(km) ? km : Number.POSITIVE_INFINITY;
}
