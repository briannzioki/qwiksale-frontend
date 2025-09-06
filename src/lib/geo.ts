// src/lib/geo.ts
// Lightweight, tree-shakeable geo utilities for distance & geolocation.

export type LatLon = { lat: number; lon: number };

/* ----------------------------- math + constants ---------------------------- */
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const R_KM = 6371; // mean Earth radius (km)

/** Convert degrees to radians. */
export const toRad = (deg: number) => deg * DEG;
/** Convert radians to degrees. */
export const toDeg = (rad: number) => rad * RAD;

/** Normalize longitude to [-180, 180). */
export function normalizeLon(lon: number): number {
  let x = ((lon + 180) % 360 + 360) % 360; // [0, 360)
  return x - 180; // [-180, 180)
}

/** Clamp latitude to [-90, 90]. */
export const clampLat = (lat: number) => Math.max(-90, Math.min(90, lat));

/** Return a normalized/valid LatLon (clamps lat, wraps lon). */
export function clampLatLon(p: LatLon): LatLon {
  return { lat: clampLat(p.lat), lon: normalizeLon(p.lon) };
}

/* -------------------------------- distances -------------------------------- */

/** Great-circle distance (Haversine). Result in kilometers. */
export function kmBetween(a: LatLon, b: LatLon): number {
  const aC = clampLatLon(a);
  const bC = clampLatLon(b);
  const dLat = toRad(bC.lat - aC.lat);
  const dLon = toRad(bC.lon - aC.lon);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const c =
    s1 * s1 +
    Math.cos(toRad(aC.lat)) * Math.cos(toRad(bC.lat)) * s2 * s2;
  return 2 * R_KM * Math.asin(Math.sqrt(c));
}

/** Great-circle distance in meters (rounded). */
export function metersBetween(a: LatLon, b: LatLon): number {
  return Math.round(kmBetween(a, b) * 1000);
}

/** Human-friendly distance: meters under 1 km, otherwise rounded km. */
export function fmtKm(km?: number | null): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${Math.round(km)} km`;
}

/** Human-friendly distance (Intl). Examples: “850 m”, “2.3 km”. */
export function fmtDistanceIntl(km?: number | null, locale = "en-KE"): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) {
    return new Intl.NumberFormat(locale, { style: "unit", unit: "meter" }).format(
      Math.round(km * 1000)
    );
  }
  return new Intl.NumberFormat(locale, { style: "unit", unit: "kilometer", maximumFractionDigits: 1 }).format(km);
}

/* ------------------------------ sorting / bbox ----------------------------- */

/** Sort a copy of items by distance to origin. */
export function sortByDistance<T extends LatLon>(origin: LatLon, items: T[]): T[] {
  const o = clampLatLon(origin);
  return [...items].sort((a, b) => kmBetween(o, a) - kmBetween(o, b));
}

/** Quick bounding box (in degrees) around a point for rough map focus. */
export function bboxAroundPoint(center: LatLon, kmRadius = 5) {
  const c = clampLatLon(center);
  const latRadiusDeg = (kmRadius / R_KM) * RAD;
  const lonRadiusDeg = latRadiusDeg / Math.cos(toRad(c.lat) || 1e-12);
  return {
    minLat: c.lat - latRadiusDeg,
    maxLat: c.lat + latRadiusDeg,
    minLon: normalizeLon(c.lon - lonRadiusDeg),
    maxLon: normalizeLon(c.lon + lonRadiusDeg),
  };
}

export type BBox = ReturnType<typeof bboxAroundPoint>;

/** Expand a bbox by a given km radius. */
export function expandBbox(b: BBox, km = 1): BBox {
  const latPad = (km / R_KM) * RAD;
  const avgLat = (b.minLat + b.maxLat) / 2;
  const lonPad = latPad / Math.cos(toRad(avgLat) || 1e-12);
  return {
    minLat: b.minLat - latPad,
    maxLat: b.maxLat + latPad,
    minLon: normalizeLon(b.minLon - lonPad),
    maxLon: normalizeLon(b.maxLon + lonPad),
  };
}

/** Check if a point lies inside bbox (naive, OK for small spans). */
export function bboxContains(b: BBox, p: LatLon): boolean {
  const c = clampLatLon(p);
  const inLat = c.lat >= b.minLat && c.lat <= b.maxLat;
  // handle antimeridian wrap by normalizing both sides
  const minLon = normalizeLon(b.minLon);
  const maxLon = normalizeLon(b.maxLon);
  const lon = normalizeLon(c.lon);
  const inLon =
    minLon <= maxLon
      ? lon >= minLon && lon <= maxLon
      : lon >= minLon || lon <= maxLon; // wrapped case
  return inLat && inLon;
}

/* ----------------------------- bearings/routes ----------------------------- */

/** Initial bearing (degrees) from A to B (0..360). */
export function bearingDegrees(a: LatLon, b: LatLon): number {
  const aC = clampLatLon(a);
  const bC = clampLatLon(b);
  const φ1 = toRad(aC.lat);
  const φ2 = toRad(bC.lat);
  const λ1 = toRad(aC.lon);
  const λ2 = toRad(bC.lon);
  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Destination point given start, bearing (deg), and distance (km). */
export function destinationPoint(start: LatLon, bearingDeg: number, distanceKm: number): LatLon {
  const s = clampLatLon(start);
  const δ = distanceKm / R_KM; // angular distance
  const θ = toRad(bearingDeg);
  const φ1 = toRad(s.lat);
  const λ1 = toRad(s.lon);

  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);

  const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ);
  const φ2 = Math.asin(Math.max(-1, Math.min(1, sinφ2)));

  const y = Math.sin(θ) * sinδ * cosφ1;
  const x = cosδ - sinφ1 * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);

  return clampLatLon({ lat: toDeg(φ2), lon: toDeg(λ2) });
}

/* --------------------------- browser geolocation --------------------------- */

/** Promise wrapper around browser geolocation (SSR-safe). */
export function safeGetBrowserPosition(
  opts: PositionOptions = { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
): Promise<LatLon> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("Geolocation not available"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      opts
    );
  });
}

/** Subscribe to position updates (returns an unsubscribe function). */
export function safeWatchBrowserPosition(
  onChange: (p: LatLon) => void,
  onError?: (e: GeolocationPositionError) => void,
  opts: PositionOptions = { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
): () => void {
  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    onError?.(new DOMException("Geolocation not available") as any);
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => onChange({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
    (err) => onError?.(err),
    opts
  );
  return () => navigator.geolocation.clearWatch(id);
}

/* ---------------------------------- misc ---------------------------------- */

/** Try to parse a `{lat, lon}` from loose inputs; returns null if invalid. */
export function tryParseLatLon(lat: unknown, lon: unknown): LatLon | null {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return clampLatLon({ lat: la, lon: lo });
}
