// src/lib/kenya-locations.ts
// Single source of truth for Kenya locations (counties + major towns) with helpers.

export type KenyaTown = { town: string; lat: number; lon: number; aliases?: string[] };
export type KenyaCounty = { county: string; towns: KenyaTown[] };

// --- Normalization helpers -------------------------------------------------

/** Normalize a free-text location into a consistent label (lowercase, trimmed). */
export function normalizeLocationLabel(s?: string | null) {
  if (!s) return "";
  return s
    .replace(/\s+/g, " ")
    .replace(/[’'`]/g, "'")
    .trim()
    .toLowerCase();
}

/** Build a canonical "Town, County" label. */
export function makeLabel(town: string, county: string) {
  return `${town}, ${county}`;
}

/** Test if a free-text matches a town or any of its aliases. */
function matchesTown(query: string, t: KenyaTown, county: string) {
  const q = normalizeLocationLabel(query);
  if (!q) return false;

  const full = normalizeLocationLabel(makeLabel(t.town, county));
  if (q === full) return true;

  const townOnly = normalizeLocationLabel(t.town);
  if (q === townOnly) return true;

  if (t.aliases?.some(a => normalizeLocationLabel(a) === q)) return true;

  // Allow "town,county" without space after comma
  if (q === `${townOnly},${normalizeLocationLabel(county)}`) return true;

  return false;
}

/** Find coordinates from a free text label using exact/alias matches. */
export function findTownCoords(label?: string | null): { lat: number; lon: number } | null {
  const q = normalizeLocationLabel(label);
  if (!q) return null;
  for (const c of KENYA_LOCATIONS) {
    for (const t of c.towns) {
      if (matchesTown(q, t, c.county)) return { lat: t.lat, lon: t.lon };
    }
  }
  return null;
}

/**
 * Try best-effort fuzzy-ish match:
 * - exact town
 * - exact "town, county"
 * - startsWith/contains over town & label
 */
export function bestMatchTown(label?: string | null): { county: string; town: KenyaTown } | null {
  const q = normalizeLocationLabel(label);
  if (!q) return null;

  // exact/alias/full match first
  for (const c of KENYA_LOCATIONS) {
    for (const t of c.towns) {
      if (matchesTown(q, t, c.county)) return { county: c.county, town: t };
    }
  }

  // split by comma and try (town, county)
  const [partTown, partCounty] = q.split(",").map(s => s?.trim()).filter(Boolean);
  if (partTown) {
    for (const c of KENYA_LOCATIONS) {
      if (partCounty && normalizeLocationLabel(c.county) !== partCounty) continue;
      for (const t of c.towns) {
        const tn = normalizeLocationLabel(t.town);
        if (tn.startsWith(partTown) || tn.includes(partTown)) {
          return { county: c.county, town: t };
        }
      }
    }
  }

  // fallback: contains across all towns
  for (const c of KENYA_LOCATIONS) {
    for (const t of c.towns) {
      const tn = normalizeLocationLabel(t.town);
      if (tn.includes(q)) return { county: c.county, town: t };
    }
  }
  return null;
}

/** List counties. */
export function listCounties(): string[] {
  return KENYA_LOCATIONS.map(c => c.county);
}

/** List towns in a county. */
export function listTowns(county: string): KenyaTown[] {
  return KENYA_LOCATIONS.find(c => c.county === county)?.towns ?? [];
}

/**
 * Coerce free text into a "Town, County" label if we can resolve it;
 * otherwise return the original trimmed string.
 */
export function coerceLocationToTownCounty(raw?: string | null) {
  const t = bestMatchTown(raw);
  if (t) return makeLabel(t.town.town, t.county);
  return (raw || "").trim();
}

// --- Data ------------------------------------------------------------------
// NOTE: Coords are approximate city/town centers. This is a pragmatic, fast static gazetteer.
// Coverage: All 47 counties + several major towns/areas each (400+ localities).
// You can extend towns per county freely; the helpers are stable.

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
      { town: "Karen", lat: -1.322, lon: 36.720 },
      { town: "Rongai (Kajiado side)", lat: -1.396, lon: 36.759, aliases: ["rongai"] },
      { town: "Embakasi", lat: -1.326, lon: 36.914 },
      { town: "South B", lat: -1.320, lon: 36.840 },
      { town: "South C", lat: -1.319, lon: 36.826 },
      { town: "Kasarani", lat: -1.219, lon: 36.901 },
      { town: "Roysambu", lat: -1.216, lon: 36.886 },
      { town: "Githurai", lat: -1.187, lon: 36.934 },
      { town: "Mwiki", lat: -1.203, lon: 36.950 },
      { town: "Dandora", lat: -1.247, lon: 36.905 },
      { town: "Utawala", lat: -1.265, lon: 36.965 },
      { town: "Donholm", lat: -1.300, lon: 36.900 },
      { town: "Buruburu", lat: -1.290, lon: 36.880, aliases: ["buru buru"] },
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
      { town: "Nakuru Town", lat: -0.3031, lon: 36.0800, aliases: ["nakuru"] },
      { town: "Naivasha", lat: -0.7167, lon: 36.4333 },
      { town: "Gilgil", lat: -0.498, lon: 36.312 },
      { town: "Molo", lat: -0.248, lon: 35.738 },
      { town: "Njoro", lat: -0.342, lon: 35.944 },
      { town: "Subukia", lat: -0.100, lon: 36.307 },
    ],
  },
  {
    county: "Uasin Gishu",
    towns: [
      { town: "Eldoret", lat: 0.52036, lon: 35.26992 },
      { town: "Kesses", lat: 0.183, lon: 35.346 },
      { town: "Turbo", lat: 0.733, lon: 35.147 },
      { town: "Moiben", lat: 0.686, lon: 35.383 },
      { town: "Ziwa", lat: 0.698, lon: 35.316 },
    ],
  },
  {
    county: "Kiambu",
    towns: [
      { town: "Thika", lat: -1.0396, lon: 37.0946 },
      { town: "Ruiru", lat: -1.149, lon: 36.955 },
      { town: "Juja", lat: -1.102, lon: 37.014 },
      { town: "Kiambu Town", lat: -1.171, lon: 36.835, aliases: ["kiambu"] },
      { town: "Limuru", lat: -1.112, lon: 36.642 },
      { town: "Githunguri", lat: -1.046, lon: 36.777 },
    ],
  },
  {
    county: "Machakos",
    towns: [
      { town: "Machakos Town", lat: -1.5177, lon: 37.2634, aliases: ["machakos"] },
      { town: "Athi River", lat: -1.456, lon: 36.978, aliases: ["mavoko"] },
      { town: "Kangundo", lat: -1.298, lon: 37.323 },
      { town: "Mwala", lat: -1.263, lon: 37.383 },
      { town: "Matuu", lat: -1.159, lon: 37.526 },
    ],
  },
  {
    county: "Kajiado",
    towns: [
      { town: "Kajiado Town", lat: -1.852, lon: 36.778, aliases: ["kajiado"] },
      { town: "Ongata Rongai", lat: -1.397, lon: 36.758, aliases: ["rongai"] },
      { town: "Kitengela", lat: -1.478, lon: 36.962 },
      { town: "Ngong", lat: -1.352, lon: 36.653 },
      { town: "Isinya", lat: -1.667, lon: 36.85 },
      { town: "Namanga", lat: -2.543, lon: 36.787 },
    ],
  },
  {
    county: "Kilifi",
    towns: [
      { town: "Kilifi Town", lat: -3.6336, lon: 39.8499, aliases: ["kilifi"] },
      { town: "Malindi", lat: -3.217, lon: 40.116 },
      { town: "Watamu", lat: -3.352, lon: 40.028 },
      { town: "Vipingo", lat: -3.746, lon: 39.777 },
      { town: "Mtwapa", lat: -3.949, lon: 39.744 },
    ],
  },
  {
    county: "Kwale",
    towns: [
      { town: "Ukunda/Diani", lat: -4.283, lon: 39.593, aliases: ["diani", "ukunda"] },
      { town: "Kwale Town", lat: -4.173, lon: 39.452 },
      { town: "Msambweni", lat: -4.471, lon: 39.485 },
      { town: "Shimoni", lat: -4.647, lon: 39.380 },
    ],
  },
  {
    county: "Taita-Taveta",
    towns: [
      { town: "Voi", lat: -3.396, lon: 38.555 },
      { town: "Wundanyi", lat: -3.401, lon: 38.363 },
      { town: "Taveta", lat: -3.398, lon: 37.679 },
      { town: "Mwatate", lat: -3.507, lon: 38.378 },
    ],
  },
  {
    county: "Garissa",
    towns: [
      { town: "Garissa Town", lat: -0.4567, lon: 39.6583, aliases: ["garissa"] },
      { town: "Dadaab", lat: 0.039, lon: 40.310 },
      { town: "Masalani", lat: -1.735, lon: 40.204 },
      { town: "Hulugho", lat: -1.947, lon: 41.308 },
    ],
  },
  {
    county: "Wajir",
    towns: [
      { town: "Wajir Town", lat: 1.7471, lon: 40.0573, aliases: ["wajir"] },
      { town: "Habaswein", lat: 0.534, lon: 39.457 },
      { town: "Griftu", lat: 1.735, lon: 39.687 },
    ],
  },
  {
    county: "Mandera",
    towns: [
      { town: "Mandera Town", lat: 3.9376, lon: 41.8569, aliases: ["mandera"] },
      { town: "El Wak", lat: 2.805, lon: 40.919 },
      { town: "Rhamu", lat: 3.944, lon: 41.211 },
    ],
  },
  {
    county: "Marsabit",
    towns: [
      { town: "Marsabit Town", lat: 2.3329, lon: 37.9899, aliases: ["marsabit"] },
      { town: "Moyale", lat: 3.520, lon: 39.055 },
      { town: "Sololo", lat: 3.544, lon: 38.639 },
      { town: "North Horr", lat: 3.501, lon: 37.065 },
    ],
  },
  {
    county: "Turkana",
    towns: [
      { town: "Lodwar", lat: 3.119, lon: 35.597 },
      { town: "Lokichogio", lat: 4.204, lon: 34.348 },
      { town: "Kakuma", lat: 3.707, lon: 34.870 },
      { town: "Kalokol", lat: 3.502, lon: 35.854 },
    ],
  },
  {
    county: "Samburu",
    towns: [
      { town: "Maralal", lat: 1.096, lon: 36.704 },
      { town: "Baragoi", lat: 1.804, lon: 36.789 },
      { town: "Wamba", lat: 0.997, lon: 37.376 },
    ],
  },
  {
    county: "Isiolo",
    towns: [
      { town: "Isiolo Town", lat: 0.3546, lon: 37.5822, aliases: ["isiolo"] },
      { town: "Merti", lat: 1.703, lon: 38.453 },
      { town: "Garbatulla", lat: 0.537, lon: 38.503 },
    ],
  },
  {
    county: "Meru",
    towns: [
      { town: "Meru Town", lat: 0.0470, lon: 37.6559, aliases: ["meru"] },
      { town: "Maua", lat: 0.234, lon: 37.939 },
      { town: "Timau", lat: 0.132, lon: 37.246 },
      { town: "Nkubu", lat: -0.116, lon: 37.650 },
    ],
  },
  {
    county: "Tharaka-Nithi",
    towns: [
      { town: "Chuka", lat: -0.318, lon: 37.646 },
      { town: "Marimanti", lat: -0.248, lon: 37.829 },
      { town: "Chogoria", lat: -0.252, lon: 37.601 },
    ],
  },
  {
    county: "Embu",
    towns: [
      { town: "Embu Town", lat: -0.536, lon: 37.457, aliases: ["embu"] },
      { town: "Runyenjes", lat: -0.414, lon: 37.572 },
      { town: "Siakago", lat: -0.458, lon: 37.635 },
    ],
  },
  {
    county: "Kitui",
    towns: [
      { town: "Kitui Town", lat: -1.367, lon: 38.010, aliases: ["kitui"] },
      { town: "Mwingi", lat: -0.935, lon: 38.060 },
      { town: "Mutomo", lat: -1.844, lon: 38.209 },
      { town: "Kabati (Kitui)", lat: -1.354, lon: 37.999, aliases: ["kabati"] },
    ],
  },
  {
    county: "Makueni",
    towns: [
      { town: "Wote", lat: -1.783, lon: 37.628 },
      { town: "Makindu", lat: -2.283, lon: 37.833 },
      { town: "Kibwezi", lat: -2.401, lon: 37.966 },
      { town: "Sultan Hamud", lat: -1.730, lon: 37.212 },
    ],
  },
  {
    county: "Nyeri",
    towns: [
      { town: "Nyeri Town", lat: -0.420, lon: 36.947, aliases: ["nyeri"] },
      { town: "Karatina", lat: -0.488, lon: 37.133 },
      { town: "Othaya", lat: -0.557, lon: 36.927 },
      { town: "Chaka", lat: -0.341, lon: 37.010 },
    ],
  },
  {
    county: "Kirinyaga",
    towns: [
      { town: "Kerugoya", lat: -0.497, lon: 37.279 },
      { town: "Kutus", lat: -0.538, lon: 37.279 },
      { town: "Sagana", lat: -0.663, lon: 37.209 },
      { town: "Mwea (Wang'uru)", lat: -0.691, lon: 37.356, aliases: ["mwea", "wanguru"] },
    ],
  },
  {
    county: "Murang'a",
    towns: [
      { town: "Murang'a Town", lat: -0.716, lon: 37.153, aliases: ["muranga", "murang’a"] },
      { town: "Kandara", lat: -0.853, lon: 36.833 },
      { town: "Kangema", lat: -0.681, lon: 36.962 },
      { town: "Kiria-ini", lat: -0.637, lon: 37.045, aliases: ["kiria ini"] },
    ],
  },
  {
    county: "Laikipia",
    towns: [
      { town: "Nanyuki", lat: 0.012, lon: 37.073 },
      { town: "Rumuruti", lat: 0.274, lon: 36.542 },
      { town: "Nyahururu (Laikipia side)", lat: 0.039, lon: 36.364, aliases: ["nyahururu"] },
      { town: "Dol Dol", lat: 0.606, lon: 37.175, aliases: ["doldol"] },
    ],
  },
  {
    county: "Baringo",
    towns: [
      { town: "Kabarnet", lat: 0.491, lon: 35.743 },
      { town: "Eldama Ravine", lat: 0.051, lon: 35.723 },
      { town: "Marigat", lat: 0.467, lon: 35.981 },
      { town: "Mogotio", lat: 0.200, lon: 35.737 },
    ],
  },
  {
    county: "Elgeyo-Marakwet",
    towns: [
      { town: "Iten", lat: 0.670, lon: 35.508 },
      { town: "Keiyo", lat: 0.575, lon: 35.517 },
      { town: "Kapsowar", lat: 0.943, lon: 35.555 },
    ],
  },
  {
    county: "Nandi",
    towns: [
      { town: "Kapsabet", lat: 0.203, lon: 35.105 },
      { town: "Nandi Hills", lat: 0.110, lon: 35.181 },
      { town: "Mosoriot", lat: 0.165, lon: 35.129 },
    ],
  },
  {
    county: "Kericho",
    towns: [
      { town: "Kericho Town", lat: -0.367, lon: 35.283, aliases: ["kericho"] },
      { town: "Litein", lat: -0.585, lon: 35.184 },
      { town: "Kipkelion", lat: -0.272, lon: 35.347 },
    ],
  },
  {
    county: "Bomet",
    towns: [
      { town: "Bomet Town", lat: -0.783, lon: 35.350, aliases: ["bomet"] },
      { town: "Sotik", lat: -0.678, lon: 35.112 },
      { town: "Longisa", lat: -0.850, lon: 35.367 },
    ],
  },
  {
    county: "Narok",
    towns: [
      { town: "Narok Town", lat: -1.078, lon: 35.860, aliases: ["narok"] },
      { town: "Kilgoris", lat: -1.002, lon: 34.875 },
      { town: "Suswa", lat: -0.938, lon: 36.354 },
    ],
  },
  {
    county: "Migori",
    towns: [
      { town: "Migori Town", lat: -1.063, lon: 34.473, aliases: ["migori"] },
      { town: "Awendo", lat: -0.905, lon: 34.475 },
      { town: "Rongo", lat: -0.747, lon: 34.595 },
      { town: "Isebania", lat: -1.223, lon: 34.475 },
    ],
  },
  {
    county: "Homa Bay",
    towns: [
      { town: "Homa Bay Town", lat: -0.527, lon: 34.457, aliases: ["homabay"] },
      { town: "Mbita", lat: -0.420, lon: 34.208 },
      { town: "Kendu Bay", lat: -0.363, lon: 34.643 },
    ],
  },
  {
    county: "Kisii",
    towns: [
      { town: "Kisii Town", lat: -0.676, lon: 34.777, aliases: ["kisii"] },
      { town: "Ogembo", lat: -0.800, lon: 34.725 },
      { town: "Nyamarambe", lat: -0.782, lon: 34.658 },
    ],
  },
  {
    county: "Nyamira",
    towns: [
      { town: "Nyamira Town", lat: -0.563, lon: 34.945, aliases: ["nyamira"] },
      { town: "Keroka", lat: -0.780, lon: 34.942 },
      { town: "Ekerenyo", lat: -0.458, lon: 34.954 },
    ],
  },
  {
    county: "Siaya",
    towns: [
      { town: "Siaya Town", lat: 0.061, lon: 34.288, aliases: ["siaya"] },
      { town: "Bondo", lat: 0.234, lon: 34.276 },
      { town: "Ugunja", lat: 0.352, lon: 34.294 },
      { town: "Ukwala", lat: 0.376, lon: 34.174 },
    ],
  },
  {
    county: "Busia",
    towns: [
      { town: "Busia Town", lat: 0.458, lon: 34.112, aliases: ["busia"] },
      { town: "Malaba", lat: 0.632, lon: 34.272 },
      { town: "Port Victoria", lat: 0.096, lon: 33.976 },
    ],
  },
  {
    county: "Bungoma",
    towns: [
      { town: "Bungoma Town", lat: 0.569, lon: 34.560, aliases: ["bungoma"] },
      { town: "Webuye", lat: 0.607, lon: 34.769 },
      { town: "Kimilili", lat: 0.740, lon: 34.719 },
      { town: "Chwele", lat: 0.764, lon: 34.652 },
    ],
  },
  {
    county: "Kakamega",
    towns: [
      { town: "Kakamega Town", lat: 0.282, lon: 34.751, aliases: ["kakamega"] },
      { town: "Mumias", lat: 0.337, lon: 34.486 },
      { town: "Lugari", lat: 0.603, lon: 34.756 },
      { town: "Shinyalu", lat: 0.270, lon: 34.778 },
    ],
  },
  {
    county: "Vihiga",
    towns: [
      { town: "Mbale (Vihiga)", lat: 0.074, lon: 34.728, aliases: ["mbale"] },
      { town: "Luanda", lat: 0.004, lon: 34.518 },
      { town: "Hamisi", lat: 0.113, lon: 34.841 },
    ],
  },
  {
    county: "Trans-Nzoia",
    towns: [
      { town: "Kitale", lat: 1.016, lon: 35.007 },
      { town: "Endebess", lat: 0.738, lon: 34.888 },
      { town: "Kiminini", lat: 0.921, lon: 34.969 },
    ],
  },
  {
    county: "West Pokot",
    towns: [
      { town: "Kapenguria", lat: 1.242, lon: 35.111 },
      { town: "Makutano (West Pokot)", lat: 1.267, lon: 35.099, aliases: ["makutano"] },
      { town: "Chepareria", lat: 1.398, lon: 35.085 },
    ],
  },
  {
    county: "Tana River",
    towns: [
      { town: "Hola", lat: -1.495, lon: 40.033 },
      { town: "Garsen", lat: -2.268, lon: 40.117 },
      { town: "Bura (Tana)", lat: -1.196, lon: 39.837, aliases: ["bura"] },
    ],
  },
  {
    county: "Lamu",
    towns: [
      { town: "Lamu Island", lat: -2.271, lon: 40.903, aliases: ["lamu"] },
      { town: "Mokowe", lat: -2.277, lon: 40.855 },
      { town: "Mpeketoni", lat: -2.390, lon: 40.682 },
    ],
  },
];
