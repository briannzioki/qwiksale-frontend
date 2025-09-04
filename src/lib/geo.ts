// src/lib/geo.ts
// Lightweight geo utilities for distance & geolocation.

export type LatLon = { lat: number; lon: number };

const DEG = Math.PI / 180;
const R_KM = 6371; // Earth radius (km)

/** Great-circle distance (Haversine), result in kilometers. */
export function kmBetween(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(s1 + s2));
}

/** Human-friendly distance: meters under 1km, otherwise rounded km. */
export function fmtKm(km?: number | null) {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${Math.round(km)} km`;
}

/** Sort an array by distance to a given point. Mutates a copy (returns new array). */
export function sortByDistance<T extends { lat: number; lon: number }>(origin: LatLon, items: T[]) {
  return [...items].sort((a, b) => kmBetween(origin, a) - kmBetween(origin, b));
}

/** Quick bounding box (in degrees) around a point for rough map focus. */
export function bboxAroundPoint(center: LatLon, kmRadius = 5) {
  const latRadiusDeg = (kmRadius / R_KM) * (180 / Math.PI);
  const lonRadiusDeg = latRadiusDeg / Math.cos(center.lat * DEG);
  return {
    minLat: center.lat - latRadiusDeg,
    maxLat: center.lat + latRadiusDeg,
    minLon: center.lon - lonRadiusDeg,
    maxLon: center.lon + lonRadiusDeg,
  };
}

/** Promise wrapper around browser geolocation (guards SSR). */
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
