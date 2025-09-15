// src/app/li/cdn.ts

/**
 * Cloudinary URL helpers
 * - Works with foldered public IDs (e.g. "users/abc/avatar_123")
 * - Safe-encodes each path segment
 * - Sensible defaults: f_auto,q_auto,dpr_auto
 * - Handy presets: cdnUrl (compat), imgUrl, thumbUrl, blurUrl, avatarUrl, videoUrl
 */

type Fit =
  | "fill"    // c_fill (default)
  | "fit"     // c_fit
  | "scale"   // c_scale
  | "pad"     // c_pad
  | "crop"    // c_crop
  | "thumb"   // c_thumb
  | "cover";  // alias → fill with gravity auto

type Gravity =
  | "auto"
  | "center"
  | "faces"
  | "face"
  | "north"
  | "south"
  | "east"
  | "west";

/** Prefer the same env var used elsewhere in your app, with a fallback for older name. */
const CLOUD =
  process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] ||
  process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD"] ||
  "";

/** Early warning in dev if CLOUD is missing. */
if (!CLOUD && typeof window === "undefined") {
  // eslint-disable-next-line no-console
  console.warn(
    "[cdn] NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME (or _CLOUD) is not set. URLs will be broken."
  );
}

/** Return true if value already looks like a full URL (http/https). */
function isAbsoluteUrl(v: string) {
  return /^https?:\/\//i.test(v);
}

/** Allow passing local files like `/images/foo.jpg` unchanged. */
function isLocalPath(v: string) {
  return v.startsWith("/");
}

/** Safely encode each path segment of a Cloudinary public ID. */
function encodePublicId(publicId: string) {
  // Keep folder structure but escape special characters per segment
  return publicId
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

/** Build the transformation string from options. */
function buildTransform(opts: {
  w?: number;
  h?: number;
  fit?: Fit;
  gravity?: Gravity;
  quality?: number | "auto";
  format?: "auto" | "jpg" | "png" | "webp" | "avif";
  dpr?: number | "auto";
  sharpen?: number;     // e_sharpen:100
  blur?: number;        // e_blur:200
  bg?: string;          // for pad
  progressive?: boolean; // fl_progressive:steep
} = {}) {
  const {
    w,
    h,
    fit = "fill",
    gravity = "auto",
    quality = "auto",
    format = "auto",
    dpr = "auto",
    sharpen,
    blur,
    bg,
    progressive = true,
  } = opts;

  // Map fit → Cloudinary crop modes
  const crop =
    fit === "cover" ? "fill" :
    fit === "fit"   ? "fit"  :
    fit === "scale" ? "scale":
    fit === "pad"   ? "pad"  :
    fit === "thumb" ? "thumb":
    fit === "crop"  ? "crop" :
                      "fill";

  const parts: string[] = [];

  // Size & crop
  if (typeof w === "number") parts.push(`w_${Math.round(w)}`);
  if (typeof h === "number") parts.push(`h_${Math.round(h)}`);
  if (crop) parts.push(`c_${crop}`);
  if (gravity && (crop === "fill" || crop === "thumb" || crop === "crop")) {
    parts.push(`g_${gravity}`);
  }
  if (bg && crop === "pad") parts.push(`b_${bg}`);

  // Quality/format/DPR
  if (format === "auto") parts.push("f_auto");
  else parts.push(`f_${format}`);
  if (quality === "auto") parts.push("q_auto");
  else if (typeof quality === "number") parts.push(`q_${Math.max(1, Math.min(100, quality))}`);
  if (dpr === "auto") parts.push("dpr_auto");
  else if (typeof dpr === "number") parts.push(`dpr_${dpr}`);

  // Effects
  if (typeof sharpen === "number") parts.push(`e_sharpen:${Math.max(1, Math.min(200, sharpen))}`);
  if (typeof blur === "number") parts.push(`e_blur:${Math.max(1, Math.min(2000, blur))}`);

  // Flags
  if (progressive && (format === "auto" || format === "jpg")) {
    parts.push("fl_progressive:steep");
  }

  return parts.join(",");
}

/** Core image URL builder. */
export function imgUrl(
  publicId: string,
  opts: {
    w?: number;
    h?: number;
    fit?: Fit;
    gravity?: Gravity;
    quality?: number | "auto";
    format?: "auto" | "jpg" | "png" | "webp" | "avif";
    dpr?: number | "auto";
    sharpen?: number;
    blur?: number;
    bg?: string;
    progressive?: boolean;
  } = {}
) {
  if (!publicId) return "";
  if (isAbsoluteUrl(publicId) || isLocalPath(publicId)) return publicId;
  const pid = encodePublicId(publicId);
  const t = buildTransform(opts);
  const tx = t ? `${t}/` : "";
  return `https://res.cloudinary.com/${CLOUD}/image/upload/${tx}${pid}`;
}

/** Super-tiny preview (good as a lightweight blur placeholder source). */
export function blurUrl(publicId: string, opts?: { width?: number; blur?: number; quality?: number }) {
  const { width = 24, blur = 800, quality = 10 } = opts || {};
  return imgUrl(publicId, {
    w: width,
    fit: "fill",
    blur,
    quality,
    format: "auto",
    dpr: 1,
    progressive: false,
  });
}

/** Square thumb with smart cropping (faces) */
export function thumbUrl(publicId: string, size = 300) {
  return imgUrl(publicId, { w: size, h: size, fit: "fill", gravity: "face" });
}

/** Rounded avatar helper (transparent pad to square if needed) */
export function avatarUrl(publicId: string, size = 128) {
  // Use pad + transparent bg so non-square images keep aspect without cropping faces
  return imgUrl(publicId, { w: size, h: size, fit: "pad", bg: "transparent", quality: "auto" });
}

/** Video URL with poster support */
export function videoUrl(publicId: string, opts?: { format?: "mp4" | "webm"; quality?: number | "auto" }) {
  if (!publicId) return "";
  if (isAbsoluteUrl(publicId) || isLocalPath(publicId)) return publicId;
  const pid = encodePublicId(publicId);
  const format = opts?.format ?? "mp4";
  const q = opts?.quality ?? "auto";
  const parts = [q === "auto" ? "q_auto" : `q_${q}`, "f_" + format].join(",");
  return `https://res.cloudinary.com/${CLOUD}/video/upload/${parts}/${pid}`;
}

/* ------------------------------------------------------------------ */
/* --------- Back-compat exports (keep your existing import) --------- */
/* ------------------------------------------------------------------ */

/** Legacy signature: cdnUrl(publicId, w?, h?) */
export function cdnUrl(publicId: string, w?: number, h?: number) {
  // When either w or h is given, crop to fill; else just auto format/quality.
  if (!w && !h) return imgUrl(publicId, { format: "auto", quality: "auto" });

  // Build options without inserting undefined keys (exactOptionalPropertyTypes-safe)
  const opts: {
    w?: number;
    h?: number;
    fit: Fit;
    gravity: Gravity;
  } = { fit: "fill", gravity: "auto" };

  if (typeof w === "number") opts.w = w;
  if (typeof h === "number") opts.h = h;

  return imgUrl(publicId, opts);
}

/** Legacy tiny blur helper (URL version; see blurUrl). */
export function cdnBlur(publicId: string) {
  return blurUrl(publicId, { width: 24, blur: 800, quality: 10 });
}
