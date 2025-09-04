// src/app/lib/kenya-geo.ts
export type Coords = { lat: number; lon: number };

const PLACES: Record<string, Coords> = {
  // Counties / major towns (add more as you wish)
  "nairobi":             { lat: -1.286389, lon: 36.817223 },
  "westlands":           { lat: -1.268,    lon: 36.811 },
  "kiambu":              { lat: -1.1714,   lon: 36.8356 },
  "ruiru":               { lat: -1.149,    lon: 36.955 },
  "juja":                { lat: -1.107,    lon: 37.014 },
  "thika":               { lat: -1.0333,   lon: 37.0693 },
  "machakos":            { lat: -1.5167,   lon: 37.2667 },
  "mombasa":             { lat: -4.0435,   lon: 39.6682 },
  "malindi":             { lat: -3.2180,   lon: 40.1169 },
  "kilifi":              { lat: -3.6300,   lon: 39.8500 },
  "lamu":                { lat: -2.2717,   lon: 40.9020 },
  "nakuru":              { lat: -0.3031,   lon: 36.0800 },
  "naivasha":            { lat: -0.7167,   lon: 36.4333 },
  "eldoret":             { lat: 0.5143,    lon: 35.2698 },
  "kisumu":              { lat: -0.0917,   lon: 34.7680 },
  "kakamega":            { lat: 0.2827,    lon: 34.7519 },
  "bungoma":             { lat: 0.5635,    lon: 34.5605 },
  "busia":               { lat: 0.4597,    lon: 34.1114 },
  "nyeri":               { lat: -0.4167,   lon: 36.9500 },
  "meru":                { lat: 0.0473,    lon: 37.6559 },
  "embu":                { lat: -0.5333,   lon: 37.4500 },
  "nanyuki":             { lat: 0.0167,    lon: 37.0667 },
  "narok":               { lat: -1.0808,   lon: 35.8711 },
  "kericho":             { lat: -0.3689,   lon: 35.2831 },
  "kisii":               { lat: -0.6773,   lon: 34.7796 },
  "garissa":             { lat: -0.4533,   lon: 39.6460 },
  "voi":                 { lat: -3.3961,   lon: 38.5550 },
  "kitale":              { lat: 1.0157,    lon: 35.0061 },
  "murang'a":            { lat: -0.7833,   lon: 37.1333 },
  "nyahururu":           { lat: 0.0339,    lon: 36.3570 },
  "migori":              { lat: -1.0634,   lon: 34.4731 },
  "homa bay":            { lat: -0.5273,   lon: 34.4571 },
  "siaya":               { lat: 0.0612,    lon: 34.2881 },
  "bomet":               { lat: -0.7839,   lon: 35.3416 },
  "kirinyaga":           { lat: -0.6667,   lon: 37.3667 },
  // add any neighborhoods you use often…
};

export function lookupCoords(raw: string | null | undefined): Coords | null {
  if (!raw) return null;
  const key = String(raw).toLowerCase().trim();
  if (!key) return null;
  // try exact
  if (PLACES[key]) return PLACES[key];
  // try stripping words like "county", "kenya", punctuation
  const norm = key
    .replace(/county|kenya/gi, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (PLACES[norm]) return PLACES[norm];
  return null;
}

export function haversineKm(a: Coords, b: Coords): number {
  const R = 6371; // km
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
