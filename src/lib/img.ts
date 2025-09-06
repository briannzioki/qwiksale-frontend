/**
 * Cloudinary transform injector (idempotent).
 * Works for delivery URLs like:
 *   https://res.cloudinary.com/<cloud>/image/upload/<existing transforms>/v<ver>/<public_id>.<ext>
 */
export type LqipOptions = {
  /** Auto format (default: true) */
  fAuto?: boolean;
  /** Auto quality preset (e.g. 'auto:eco', 'auto:low') (default: 'auto:eco') */
  q?: string;
  /** Blur amount (default: 800) */
  blur?: number;
  /** Target width (default: 20) */
  width?: number;
  /** Device pixel ratio multiplier (default: 1) */
  dpr?: number;
  /** Extra raw Cloudinary flags (comma-separated), appended after ours */
  extra?: string;
};

/** Tiny 1x1 transparent PNG as data URL (fallback when not Cloudinary) */
export const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8AABgMBcHjYcZsAAAAASUVORK5CYII=";

/** Quick guard: is this a Cloudinary delivery URL? */
export function isCloudinaryUrl(url: string): boolean {
  return /(^https?:)?\/\/res\.cloudinary\.com\//i.test(url);
}

/**
 * Insert/merge Cloudinary transformations into a delivery URL.
 * Idempotent: if a public URL already has an `upload/<...>/` segment with transforms,
 * they'll be merged; our keys (f,q,e_blur,w,dpr) are set only if missing.
 */
export function injectCloudinaryTransforms(
  url: string,
  opts: LqipOptions = {}
): string {
  if (!isCloudinaryUrl(url)) return url;

  const {
    fAuto = true,
    q = "auto:eco",
    blur = 800,
    width = 20,
    dpr = 1,
    extra,
  } = opts;

  // Split on '/upload/' once
  const uploadIdx = url.indexOf("/upload/");
  if (uploadIdx === -1) return url;

  const head = url.slice(0, uploadIdx + "/upload/".length);
  const tail = url.slice(uploadIdx + "/upload/".length); // may start with transforms or version/public_id

  // Detect transforms segment (before the next '/')
  const firstSlash = tail.indexOf("/");
  const maybeTransforms = firstSlash === -1 ? tail : tail.slice(0, firstSlash);
  const rest = firstSlash === -1 ? "" : tail.slice(firstSlash + 1);

  // If the "maybeTransforms" segment contains '=' or ':' or ',' assume it's transforms
  const hasTransformSegment = /[=:,]/.test(maybeTransforms);

  // Start with existing transforms (split by ','), or empty list
  const existing = hasTransformSegment && maybeTransforms ? maybeTransforms.split(",") : [];

  // Build a map for quick overwrite/skip (key -> value or true for flags)
  const tmap = new Map<string, string | true>();
  for (const t of existing) {
    // Explicitly annotate tuple so TS knows first is string and second may be undefined
    const [k, v]: [string, string?] = t.split("_", 2) as [string, string?];
    if (typeof v === "string") {
      tmap.set(k, v);
    } else if (t.includes(":")) {
      const [k2, v2]: [string, string?] = t.split(":", 2) as [string, string?];
      if (typeof v2 === "string") tmap.set(k2, v2);
    } else {
      tmap.set(t, true);
    }
  }

  // Apply our defaults only if not present
  if (fAuto && !tmap.has("f")) tmap.set("f", "auto");
  if (q && !tmap.has("q")) tmap.set("q", q);
  if (blur && !tmap.has("e_blur")) tmap.set("e_blur", String(blur));
  if (width && !tmap.has("w")) tmap.set("w", String(width));
  if (dpr && dpr !== 1 && !tmap.has("dpr")) tmap.set("dpr", String(dpr));

  // Append extras (raw, comma-separated), but don’t overwrite existing keys
  if (extra) {
    for (const raw of extra.split(",").map(s => s.trim()).filter(Boolean)) {
      const [k1, v1]: [string, string?] = (raw.includes("_")
        ? raw.split("_", 2)
        : raw.split(":", 2)) as [string, string?];

      if (!k1) continue; // empty safety
      if (!tmap.has(k1)) tmap.set(k1, v1 ?? (true as true));
    }
  }

  // Rebuild the transforms in a stable order (optional ordering for readability)
  const ORDER = ["f", "q", "e_blur", "w", "dpr"] as const;
  const keys = Array.from(tmap.keys());
  keys.sort((a, b) => {
    const ia = ORDER.indexOf(a as (typeof ORDER)[number]);
    const ib = ORDER.indexOf(b as (typeof ORDER)[number]);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
    });

  const transforms = keys
    .map(k => {
      const v = tmap.get(k);
      if (v === true) return k;
      // Prefer underscore separator for standard CLD syntax
      return `${k}_${v}`;
    })
    .join(",");

  // If original had transforms, replace that segment; otherwise insert before the rest
  const outTail = hasTransformSegment ? `${transforms}/${rest}` : `${transforms}/${tail}`;
  return head + outTail;
}

/**
 * LQIP helper: returns a **transformed Cloudinary URL** for tiny blurred preview.
 * Non-Cloudinary URLs are returned unchanged (use `tinyFallback` for an inline placeholder).
 */
export function lqip(url: string, opts?: LqipOptions): string {
  return injectCloudinaryTransforms(url, {
    fAuto: true,
    q: "auto:eco",
    blur: 800,
    width: 20,
    dpr: 1,
    ...opts,
  });
}

/** Returns a good blur placeholder src: Cloudinary LQIP when possible, else tiny inline PNG. */
export function blurSrc(url: string, opts?: LqipOptions): string {
  return isCloudinaryUrl(url) ? lqip(url, opts) : TINY_PNG;
}
