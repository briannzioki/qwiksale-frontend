"use client";

import Image, { type ImageProps } from "next/image";
import type { StaticImageData } from "next/image";
import { useMemo, useState, useEffect } from "react";

type AcceptableSrc = string | StaticImageData | null | undefined;

type Props = Omit<ImageProps, "src" | "alt"> & {
  /** Cloudinary public ID, absolute URL, data/blob URL, site-relative path, or StaticImageData. */
  src?: AcceptableSrc;
  /** Optional alt; defaults to a safe string if omitted/empty. */
  alt?: string | null | undefined;
  /** Optional hard fallback image path/URL; defaults to local placeholder. */
  fallbackSrc?: string;
  /** Auto add a tiny blur placeholder when none is provided (default: true). */
  autoBlurPlaceholder?: boolean;
  /** Optional class applied to the wrapper used when fill is true. */
  wrapperClassName?: string;
  /**
   * Opt-in to Next's image optimizer. Default is **off** so E2E tests
   * can read the real image URLs (no `/_next/image`).
   */
  optimize?: boolean;
  /**
   * When true, do NOT swap to the placeholder on error — keeps the real URL
   * in the DOM for tests to count.
   */
  preserveOnError?: boolean;
};

const DEFAULT_PLACEHOLDER = "/placeholder/default.jpg";
const CLOUD_NAME = process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] ?? "";

/* ------------------------------ helpers ------------------------------ */

function resolveSrc(
  input?: AcceptableSrc,
  fallback = DEFAULT_PLACEHOLDER
): string | StaticImageData {
  if (!input) return fallback;

  // StaticImageData
  if (typeof input === "object" && input !== null && "src" in input) return input;

  const raw = String(input).trim();
  if (!raw) return fallback;

  // Already a usable URL/path
  if (/^(https?:|data:|blob:)/i.test(raw) || raw.startsWith("/")) return raw;

  // Public ID → Cloudinary URL when cloud name present
  if (CLOUD_NAME) {
    const pid = raw.replace(/^\/+/, "");
    const encoded = pid.split("/").map(encodeURIComponent).join("/");
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto/${encoded}`;
  }

  // No cloud name: make it site-relative so <img src> is a concrete path
  return "/" + raw.replace(/^\/+/, "");
}

function toNumber(n?: number | `${number}`): number | undefined {
  if (typeof n === "number") return n;
  if (typeof n === "string") {
    const v = parseFloat(n);
    return Number.isFinite(v) ? v : undefined;
  }
  return undefined;
}

function tinyShimmer(width = 16, height = 9) {
  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
       xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <defs>
      <linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="#eee"/>
        <stop offset="50%" stop-color="#ddd"/>
        <stop offset="100%" stop-color="#eee"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="#eee"/>
    <rect id="r" width="${width}" height="${height}" fill="url(#g)"/>
    <animate xlink:href="#r" attributeName="x" from="-${width}" to="${width}" dur="1.2s" repeatCount="indefinite"/>
  </svg>`;
  const b64 = typeof window === "undefined" ? Buffer.from(svg).toString("base64") : btoa(svg);
  return `data:image/svg+xml;base64,${b64}`;
}

/* -------------------------------- cmp -------------------------------- */

export default function SmartImage({
  src: srcProp,
  alt,
  onError,
  onLoad,
  onLoadingComplete,
  fallbackSrc = DEFAULT_PLACEHOLDER,
  sizes: sizesProp,
  loading: loadingProp,
  priority: priorityProp,
  autoBlurPlaceholder = true,
  wrapperClassName = "",
  optimize = false,
  preserveOnError = false,
  ...rest
}: Props) {
  const initial = useMemo(() => resolveSrc(srcProp, fallbackSrc), [srcProp, fallbackSrc]);
  const [actualSrc, setActualSrc] = useState<string | StaticImageData>(initial);
  useEffect(() => setActualSrc(initial), [initial]);

  const handleError: NonNullable<ImageProps["onError"]> = (e) => {
    if (!preserveOnError && actualSrc !== fallbackSrc) {
      setActualSrc(fallbackSrc);
    }
    onError?.(e);
  };

  const handleLoad: NonNullable<ImageProps["onLoad"]> = (e) => {
    const imgEl = e.currentTarget as HTMLImageElement | null;
    if (!preserveOnError && imgEl && imgEl.naturalWidth === 0 && actualSrc !== fallbackSrc) {
      setActualSrc(fallbackSrc);
      return;
    }
    onLoad?.(e);
    if (onLoadingComplete && imgEl) onLoadingComplete(imgEl);
  };

  const safeAlt = (alt && alt.trim().length > 0 ? alt : "image") as string;
  const isSvg = typeof actualSrc === "string" && actualSrc.toLowerCase().includes(".svg");

  // E2E-friendly default: disable optimizer unless explicitly opted in
  const unoptimized = optimize ? false : true;

  const isFill = (rest as ImageProps).fill === true;
  const sizes =
    sizesProp ?? (isFill ? "(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 800px" : undefined);

  const w = toNumber((rest as ImageProps).width);
  const h = toNumber((rest as ImageProps).height);
  const inferredPriority = w !== undefined && h !== undefined && w <= 64 && h <= 64;
  const priority = priorityProp ?? inferredPriority ?? false;

  const hasExplicitPlaceholder = (rest as ImageProps).placeholder != null;
  const hasExplicitBlurData = (rest as ImageProps).blurDataURL != null;
  const shouldAutoBlur =
    autoBlurPlaceholder && !isSvg && !hasExplicitPlaceholder && !hasExplicitBlurData;

  const extra: Partial<ImageProps> = {};
  if (shouldAutoBlur) {
    extra.placeholder = "blur";
    extra.blurDataURL = tinyShimmer(24, 16);
  } else {
    if ((rest as ImageProps).placeholder) extra.placeholder = (rest as ImageProps).placeholder!;
    if ((rest as ImageProps).blurDataURL) extra.blurDataURL = (rest as ImageProps).blurDataURL!;
  }

  if ((rest as ImageProps).fetchPriority) extra.fetchPriority = (rest as ImageProps).fetchPriority!;
  extra.decoding = (rest as ImageProps).decoding ?? "async";
  extra.referrerPolicy = (rest as ImageProps).referrerPolicy ?? "strict-origin-when-cross-origin";

  const rawSrcStr =
    typeof actualSrc === "string" ? actualSrc : (actualSrc as StaticImageData).src;

  const imgEl = (
    <Image
      {...(rest as Omit<
        ImageProps,
        "src" | "alt" | "placeholder" | "blurDataURL" | "fetchPriority" | "decoding" | "referrerPolicy"
      >)}
      {...extra}
      alt={safeAlt}
      src={actualSrc}
      onError={handleError}
      onLoad={handleLoad}
      unoptimized={unoptimized}
      sizes={sizes}
      loading={priority ? undefined : (loadingProp ?? "lazy")}
      priority={priority}
      draggable={false}
      data-raw-src={rawSrcStr}
      data-no-opt={unoptimized ? "1" : "0"}
    />
  );

  // If `fill` is true, guarantee the *immediate* parent is positioned
  return isFill ? (
    <span className={["relative block h-full w-full", wrapperClassName].join(" ")} aria-hidden={false}>
      {imgEl}
    </span>
  ) : (
    imgEl
  );
}
