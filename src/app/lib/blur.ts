// src/app/lib/blur.ts

/**
 * Ultra-lightweight helpers for Next/Image placeholders.
 * - Works in both Node (RSC) and browser (client)
 * - Customizable shimmer colors, speed, radius
 * - Includes solid + transparent fallbacks
 */

type ShimmerOpts = {
  width?: number;          // px
  height?: number;         // px
  speedSec?: number;       // animation duration (lower = faster)
  radius?: number;         // corner radius
  from?: string;           // base color (left)
  mid?: string;            // highlight color (center)
  to?: string;             // base color (right)
  darkFrom?: string;       // dark-mode overrides
  darkMid?: string;
  darkTo?: string;
  useDark?: boolean;       // force dark palette (no window access in RSC)
};

/** Portable base64 (Node or Browser) */
function toBase64(input: string): string {
  if (typeof window === "undefined") {
    // Node/RSC (Buffer)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Buffer } = require("buffer");
    return Buffer.from(input).toString("base64");
  }
  // Browser
  // btoa expects Latin-1, so we UTF-8 encode first
  return btoa(unescape(encodeURIComponent(input)));
}

/** 1×1 transparent PNG data URI (handy fallback) */
export const transparentPixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";

/** Solid color placeholder */
export function solidPlaceholder(color = "#eee", width = 32, height = 20, radius = 0): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="${color}"/>
  </svg>`;
  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

/**
 * Shimmer SVG placeholder — use with Next/Image:
 * <Image placeholder="blur" blurDataURL={shimmer({ width, height })} ... />
 */
export function shimmer(opts: ShimmerOpts = {}): string {
  const {
    width = 700,
    height = 475,
    speedSec = 1.3,
    radius = 0,
    from = "#eeeeee",
    mid = "#dddddd",
    to = "#eeeeee",
    darkFrom = "#1f2937",   // slate-800
    darkMid = "#374151",    // slate-700
    darkTo = "#1f2937",
    useDark,
  } = opts;

  // Palette: if useDark is explicitly set, honor it; otherwise attempt to detect in browser
  let A = from, B = mid, C = to;
  try {
    const prefersDark =
      useDark ??
      (typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (prefersDark) {
      A = darkFrom; B = darkMid; C = darkTo;
    }
  } catch {
    /* no-op */
  }

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="loading">
  <defs>
    <linearGradient id="g">
      <stop stop-color="${A}" offset="20%"/>
      <stop stop-color="${B}" offset="50%"/>
      <stop stop-color="${C}" offset="70%"/>
    </linearGradient>
    <clipPath id="r">
      <rect width="${width}" height="${height}" rx="${radius}" ry="${radius}"/>
    </clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect width="${width}" height="${height}" fill="${A}"/>
    <rect id="m" width="${width}" height="${height}" fill="url(#g)"/>
  </g>
  <animate xlink:href="#m" attributeName="x" from="-${width}" to="${width}" dur="${speedSec}s" repeatCount="indefinite"/>
</svg>`.trim();

  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

/**
 * Convenience: typical card-sized shimmer
 * Usage: blurDataURL={cardShimmer(16/9)} // pass aspect, or width/height directly
 */
export function cardShimmer(aspect = 16 / 9, width = 640): string {
  const height = Math.round(width / aspect);
  return shimmer({ width, height, radius: 12, speedSec: 1.1 });
}

/** Helper to wrap any data URI as CSS url("...") */
export function toCssUrl(dataUri: string): string {
  return `url("${dataUri}")`;
}
