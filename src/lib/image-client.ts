// src/lib/image-client.ts
/**
 * Client-side image compression with graceful fallbacks.
 *
 * - Defaults to WebP @ 0.85 quality (falls back to JPEG if WebP unsupported)
 * - Respects a max dimension (longest side) while preserving aspect ratio
 * - Uses OffscreenCanvas when available; otherwise HTMLCanvasElement
 * - Uses createImageBitmap when available; otherwise <img> + drawImage
 * - Returns a Blob of the requested mime type
 */

export type CompressOptions = {
  /** Longest edge in CSS pixels (device pixel ratio accounted for separately). */
  maxSize?: number;
  /** Quality 0..1 (only for lossy formats). */
  quality?: number;
  /** Preferred output mime; will fall back if not supported. */
  mime?: "image/webp" | "image/jpeg";
  /** Apply devicePixelRatio scaling (default true) for sharper results. */
  respectDevicePixelRatio?: boolean;
};

let _webpSupportCache: boolean | null = null;

/** Detect if the current browser can encode to WebP. Cached. */
async function canEncodeWebP(): Promise<boolean> {
  if (_webpSupportCache != null) return _webpSupportCache;

  try {
    if ("OffscreenCanvas" in globalThis) {
      const oc = new OffscreenCanvas(1, 1);
      await (oc as any).convertToBlob?.({ type: "image/webp" });
      _webpSupportCache = true;
      return true;
    }
  } catch {
    // fall through
  }

  const can = (() => {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      return c.toDataURL("image/webp").startsWith("data:image/webp");
    } catch {
      return false;
    }
  })();

  _webpSupportCache = !!can;
  return _webpSupportCache;
}

/** Always returns a concrete, non-undefined mime. */
function pickOutputMime(
  preferred?: CompressOptions["mime"]
): "image/webp" | "image/jpeg" {
  return preferred ?? "image/webp";
}

/** Promisified canvas.toBlob with sensible defaults. */
function toBlobFallback(
  canvas: HTMLCanvasElement,
  type: "image/webp" | "image/jpeg",
  quality?: number
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      type,
      quality
    );
  });
}

type BitmapSource = ImageBitmap | HTMLImageElement;

/** Try createImageBitmap first; fall back to <img> if unavailable. */
async function loadBitmap(file: File): Promise<BitmapSource> {
  if ("createImageBitmap" in globalThis) {
    try {
      // Cast to any to allow the non-standard 'imageOrientation' option without ts-expect-error
      return await (createImageBitmap as any)(file, { imageOrientation: "from-image" });
    } catch {
      // fall through
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const el = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image load error"));
      img.crossOrigin = "anonymous";
      img.src = url;
    });
    return el;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function getSourceSize(src: BitmapSource): { width: number; height: number } {
  // Both ImageBitmap and HTMLImageElement expose width/height
  return { width: (src as any).width, height: (src as any).height };
}

/** Draw the source onto a canvas (Offscreen when available). */
function drawToCanvas(
  src: BitmapSource,
  targetW: number,
  targetH: number
): { offscreen?: OffscreenCanvas; canvas?: HTMLCanvasElement } {
  if ("OffscreenCanvas" in globalThis) {
    const oc = new OffscreenCanvas(targetW, targetH);
    const ctx = oc.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable (OffscreenCanvas)");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    (ctx as any).drawImage(src, 0, 0, targetW, targetH);
    return { offscreen: oc };
  }

  const c = document.createElement("canvas");
  c.width = targetW;
  c.height = targetH;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable (HTMLCanvas)");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  (ctx as any).drawImage(src, 0, 0, targetW, targetH);
  return { canvas: c };
}

/** Main API: compress a File to WebP (or JPEG fallback). */
export async function compressToWebP(
  file: File,
  maxSize = 1600
): Promise<Blob> {
  return compressImage(file, { maxSize, mime: "image/webp", quality: 0.85 });
}

/** Flexible compressor with options and fallbacks. */
export async function compressImage(
  file: File,
  opts: CompressOptions = {}
): Promise<Blob> {
  const {
    maxSize = 1600,
    quality = 0.85,
    mime,
    respectDevicePixelRatio = true,
  } = opts;

  const preferred = pickOutputMime(mime); // now strictly "image/webp" | "image/jpeg"
  const webpOk = preferred === "image/webp" ? await canEncodeWebP() : false;
  const outType: "image/webp" | "image/jpeg" =
    preferred === "image/webp" && !webpOk ? "image/jpeg" : preferred;

  const src = await loadBitmap(file);
  const { width: w, height: h } = getSourceSize(src);
  if (!w || !h) throw new Error("Invalid image dimensions");

  const dpr = respectDevicePixelRatio
    ? Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    : 1;

  const longest = Math.max(w, h);
  const scale = Math.min(1, (maxSize * dpr) / longest);
  const targetW = Math.max(1, Math.round(w * scale));
  const targetH = Math.max(1, Math.round(h * scale));

  const { offscreen, canvas } = drawToCanvas(src, targetW, targetH);

  if (offscreen && "convertToBlob" in offscreen) {
    try {
      return await (offscreen as any).convertToBlob({ type: outType, quality });
    } catch {
      // continue to HTMLCanvas path
    }
  }

  if (canvas) {
    return await toBlobFallback(canvas, outType, quality);
  }

  throw new Error("Failed to encode image");
}

/* ----------------------- Convenience: blob->file helper ----------------------- */

export function blobToFile(
  blob: Blob,
  original: File | { name: string },
  suggestedExt?: "webp" | "jpg" | "jpeg"
): File {
  const base =
    "name" in original ? original.name.replace(/\.[^.]+$/, "") : "image";
  const ext =
    suggestedExt ||
    (blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "bin");
  return new File([blob], `${base}.${ext}`, {
    type: blob.type,
    lastModified: Date.now(),
  });
}
