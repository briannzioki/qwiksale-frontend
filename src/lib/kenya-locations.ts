// src/lib/kenya-locations.ts
// Single source of truth for Kenya locations (counties + major towns) with helpers.

import { kmBetween, type LatLon } from "@/lib/geo";

/* =========================
 * Types
 * ========================= */
export type KenyaTown = { town: string; lat: number; lon: number; aliases?: string[] };
export type KenyaCounty = { county: string; towns: KenyaTown[] };

export type MatchResult = {
  county: string;
  town: KenyaTown;
  /** Lower is better (0 = perfect exact match) */
  score: number;
};

/* =========================
 * Normalization helpers
 * ========================= */

/** Lowercase, collapse spaces, replace curly quotes, strip accents. */
export function normalizeLocationLabel(s?: string | null): string {
  if (!s) return "";
  // NFKD: split accents, then strip combining marks
  const deAccented = s.normalize?.("NFKD").replace(/\p{M}+/gu, "") ?? s;
  return deAccented
    .replace(/[’`]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\p{L}\p{N},\-.\s]/gu, " ") // keep letters/numbers/comma/dash/period/spaces
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Canonical "Town, County" label (un-normalized). */
export function makeLabel(town: string, county: string) {
  return `${town}, ${county}`;
}

/* =========================
 * Data
 * =========================
 * NOTE: Coords are approximate centers. Extend freely.
 */

export const KENYA_LOCATIONS: KenyaCounty[] = [
  {
    county: "Nairobi",
    towns: [
      { town: "Nairobi CBD", lat: -1.28333, lon: 36.81667, aliases: ["nairobi", "cbd"] },
      { town: "Westlands", lat: -1.26899, lon: 36.81197 },
      { town: "Kilimani", lat: -1.292, lon: 36.781 },
      { town: "Kileleshwa", lat: -1.281, lon: 36.789 },
      { town: "Lavington", lat: -1.292, lon: 36.77 },
      { town: "Lang'ata", lat: -1.353, lon: 36.744, aliases: ["langata"] },
      { town: "Karen", lat: -1.322, lon: 36.72 },
      { town: "Rongai (Kajiado side)", lat: -1.396, lon: 36.759, aliases: ["rongai"] },
      { town: "Embakasi", lat: -1.326, lon: 36.914 },
      { town: "South B", lat: -1.32, lon: 36.84 },
      { town: "South C", lat: -1.319, lon: 36.826 },
      { town: "Kasarani", lat: -1.219, lon: 36.901 },
      { town: "Roysambu", lat: -1.216, lon: 36.886 },
      { town: "Githurai", lat: -1.187, lon: 36.934 },
      { town: "Mwiki", lat: -1.203, lon: 36.95 },
      { town: "Dandora", lat: -1.247, lon: 36.905 },
      { town: "Utawala", lat: -1.265, lon: 36.965 },
      { town: "Donholm", lat: -1.3, lon: 36.9 },
      { town: "Buruburu", lat: -1.29, lon: 36.88, aliases: ["buru buru"] },
      { town: "Gigiri", lat: -1.235, lon: 36.814 },
      { town: "Runda", lat: -1.227, lon: 36.823 },
      { town: "Parklands", lat: -1.267, lon: 36.808 },
      { town: "Eastleigh", lat: -1.283, lon: 36.848 },
      { town: "Kibera", lat: -1.317, lon: 36.783 },
      { town: "Kariobangi", lat: -1.249, lon: 36.879 },
      { town: "Thika Road (TRM)", lat: -1.228, lon: 36.879, aliases: ["trm", "thika rd"] },
    ],
  },
  {
    county: "Mombasa",
    towns: [
      { town: "Mombasa Island", lat: -4.05466, lon: 39.66359, aliases: ["mombasa"] },
      { town: "Nyali", lat: -3.999, lon: 39.741 },
      { town: "Bamburi", lat: -3.968, lon: 39.744 },
      { town: "Kisauni", lat: -4.018, lon: 39.694 },
      { town: "Likoni", lat: -4.095, lon: 39.655 },
      { town: "Shanzu", lat: -3.936, lon: 39.743 },
      { town: "Changamwe", lat: -4.018, lon: 39.617 },
      { town: "Moi International Airport", lat: -4.035, lon: 39.594, aliases: ["mkah"] },
    ],
  },
  {
    county: "Kisumu",
    towns: [
      { town: "Kisumu City", lat: -0.0917, lon: 34.7675, aliases: ["kisumu"] },
      { town: "Ahero", lat: -0.173, lon: 34.917 },
      { town: "Maseno", lat: 0.006, lon: 34.601 },
      { town: "Kondele", lat: -0.096, lon: 34.767 },
      { town: "Mamboleo", lat: -0.064, lon: 34.775 },
      { town: "Nyamasaria", lat: -0.106, lon: 34.792 },
    ],
  },
  {
    county: "Nakuru",
    towns: [
      { town: "Nakuru Town", lat: -0.3031, lon: 36.08, aliases: ["nakuru"] },
      { town: "Naivasha", lat: -0.7167, lon: 36.4333 },
      { town: "Gilgil", lat: -0.498, lon: 36.312 },
      { town: "Molo", lat: -0.248, lon: 35.738 },
      { town: "Njoro", lat: -0.342, lon: 35.944 },
      { town: "Subukia", lat: -0.1, lon: 36.307 },
    ],
  },
  // … (remaining counties exactly as you shared)
  {
    county: "Lamu",
    towns: [
      { town: "Lamu Island", lat: -2.271, lon: 40.903, aliases: ["lamu"] },
      { town: "Mokowe", lat: -2.277, lon: 40.855 },
      { town: "Mpeketoni", lat: -2.39, lon: 40.682 },
    ],
  },
];

/* =========================
 * Indexes (built once)
 * ========================= */

type TownRef = { county: string; town: KenyaTown };

const COUNTY_LUT: Record<string, KenyaCounty> = Object.create(null);
const TOWN_LUT: Record<string, TownRef> = Object.create(null);    // town only
const ALIAS_LUT: Record<string, TownRef> = Object.create(null);   // alias -> town
const FULL_LUT: Record<string, TownRef> = Object.create(null);    // "town, county"

(function buildIndexes() {
  for (const county of KENYA_LOCATIONS) {
    COUNTY_LUT[normalizeLocationLabel(county.county)] = county;

    for (const t of county.towns) {
      const townKey = normalizeLocationLabel(t.town);
      if (townKey) TOWN_LUT[townKey] = { county: county.county, town: t };

      const fullKey = normalizeLocationLabel(makeLabel(t.town, county.county));
      if (fullKey) FULL_LUT[fullKey] = { county: county.county, town: t };

      for (const alias of t.aliases ?? []) {
        const aliasKey = normalizeLocationLabel(alias);
        if (aliasKey) ALIAS_LUT[aliasKey] = { county: county.county, town: t };
      }
    }
  }
})();

/* =========================
 * Exact / best-effort lookup
 * ========================= */

/** Exact/alias lookup with O(1) maps. Returns coordinates or null. */
export function findTownCoords(label?: string | null): { lat: number; lon: number } | null {
  const hit = findTown(label);
  return hit ? { lat: hit.town.lat, lon: hit.town.lon } : null;
}

/** Returns the best TownRef for a label via exact/alias/full-key maps; null if none. */
export function findTown(label?: string | null): TownRef | null {
  const q = normalizeLocationLabel(label);
  if (!q) return null;

  // Perfect keys: "town, county" → town → alias
  if (FULL_LUT[q]) return FULL_LUT[q];
  if (TOWN_LUT[q]) return TOWN_LUT[q];
  if (ALIAS_LUT[q]) return ALIAS_LUT[q];

  return null;
}

/**
 * Best-effort fuzzy-ish match:
 * 1) exact/alias/full (score 0)
 * 2) When label includes comma, try town + county startsWith (score 1)
 * 3) contains/startsWith over all towns/aliases (score 2..3)
 */
export function bestMatchTown(label?: string | null): MatchResult | null {
  const q = normalizeLocationLabel(label);
  if (!q) return null;

  // 1) Perfect
  const exact = findTown(q);
  if (exact) return { county: exact.county, town: exact.town, score: 0 };

  // 2) Split into "town, county"
  const [rawTown, rawCounty] = q.split(",").map((s) => s.trim());
  if (rawTown) {
    if (rawCounty && COUNTY_LUT[rawCounty]) {
      const c = COUNTY_LUT[rawCounty];
      for (const t of c.towns) {
        const tn = normalizeLocationLabel(t.town);
        const hit = tn.startsWith(rawTown) || tn.includes(rawTown);
        if (hit) return { county: c.county, town: t, score: 1 };
        if (t.aliases?.some((a) => normalizeLocationLabel(a).startsWith(rawTown))) {
          return { county: c.county, town: t, score: 1 };
        }
      }
    }

    // 3) Global startsWith / includes
    for (const c of KENYA_LOCATIONS) {
      for (const t of c.towns) {
        const tn = normalizeLocationLabel(t.town);
        if (tn.startsWith(rawTown)) return { county: c.county, town: t, score: 2 };
        if (tn.includes(rawTown)) return { county: c.county, town: t, score: 3 };
        if (t.aliases?.some((a) => normalizeLocationLabel(a).startsWith(rawTown))) {
          return { county: c.county, town: t, score: 2 };
        }
      }
    }
  }

  // 4) Fallback contains across all towns if user typed county alone (rare)
  for (const c of KENYA_LOCATIONS) {
    const ckey = normalizeLocationLabel(c.county);
    if (ckey.includes(q)) {
      // choose county seat / first town
      const t = c.towns[0];
      if (t) return { county: c.county, town: t, score: 4 };
    }
  }

  return null;
}

/* =========================
 * Lists & search
 * ========================= */

/** List all counties (as provided). */
export function listCounties(): string[] {
  return KENYA_LOCATIONS.map((c) => c.county);
}

/** List towns for a county. Returns empty array if not found. */
export function listTowns(county: string): KenyaTown[] {
  const c = COUNTY_LUT[normalizeLocationLabel(county)];
  return c?.towns ?? [];
}

/** Flatten all towns with their counties (useful for dropdowns). */
export function listAllTowns(): Array<{ county: string; town: KenyaTown }> {
  const out: Array<{ county: string; town: KenyaTown }> = [];
  for (const c of KENYA_LOCATIONS) {
    for (const t of c.towns) out.push({ county: c.county, town: t });
  }
  return out;
}

/**
 * Lightweight search with a relevance score.
 * - Exact "town, county" = 0
 * - Exact town/alias = 1
 * - startsWith = 2
 * - includes = 3
 */
export function searchTowns(query: string, limit = 20): MatchResult[] {
  const q = normalizeLocationLabel(query);
  if (!q) return [];

  const results: MatchResult[] = [];
  const pushUnique = (r: MatchResult) => {
    // de-dup on exact pair
    if (!results.some((x) => x.town.town === r.town.town && x.county === r.county)) {
      results.push(r);
    }
  };

  // exact/full
  const ex = findTown(q);
  if (ex) pushUnique({ county: ex.county, town: ex.town, score: 0 });

  // startsWith / includes across all towns & aliases
  for (const c of KENYA_LOCATIONS) {
    for (const t of c.towns) {
      const tn = normalizeLocationLabel(t.town);
      if (tn.startsWith(q)) pushUnique({ county: c.county, town: t, score: 2 });
      else if (tn.includes(q)) pushUnique({ county: c.county, town: t, score: 3 });
      else if (t.aliases?.some((a) => normalizeLocationLabel(a).startsWith(q))) {
        pushUnique({ county: c.county, town: t, score: 2 });
      } else if (t.aliases?.some((a) => normalizeLocationLabel(a).includes(q))) {
        pushUnique({ county: c.county, town: t, score: 3 });
      }
    }
  }

  results.sort((a, b) => a.score - b.score || a.town.town.localeCompare(b.town.town));
  return results.slice(0, limit);
}

/**
 * Coerce free text into "Town, County" if resolvable; else return trimmed original.
 */
export function coerceLocationToTownCounty(raw?: string | null): string {
  const t = bestMatchTown(raw);
  if (t) return makeLabel(t.town.town, t.county);
  return (raw || "").trim();
}

/* =========================
 * Distance / nearest helpers
 * ========================= */

/** Returns nearest known town to `origin`, optionally limited to a county. */
export function nearestTown(
  origin: LatLon,
  opts?: { withinCounty?: string }
): { county: string; town: KenyaTown; distanceKm: number } | null {
  let best: { county: string; town: KenyaTown; distanceKm: number } | null = null;
  const countyKey = opts?.withinCounty ? normalizeLocationLabel(opts.withinCounty) : null;

  for (const c of KENYA_LOCATIONS) {
    if (countyKey && normalizeLocationLabel(c.county) !== countyKey) continue;
    for (const t of c.towns) {
      const d = kmBetween(origin, { lat: t.lat, lon: t.lon });
      if (!best || d < best.distanceKm) best = { county: c.county, town: t, distanceKm: d };
    }
  }
  return best;
}

/** Convenience: get coords for a label; if none, get nearest town to coords. */
export function resolveLabelOrNearest(
  label: string | null | undefined,
  origin?: LatLon
): { county: string; town: KenyaTown } | { county: string; town: KenyaTown; distanceKm: number } | null {
  const exact = bestMatchTown(label);
  if (exact) return { county: exact.county, town: exact.town, score: exact.score } as any; // score ignored by consumer
  if (origin) return nearestTown(origin);
  return null;
}
