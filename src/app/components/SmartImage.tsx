// src/app/components/SmartImage.tsx
"use client";

import Image, { type ImageProps } from "next/image";
import type { StaticImageData } from "next/image";
import { useMemo, useState, useEffect } from "react";

type AcceptableSrc = string | StaticImageData | null | undefined;

type Props = Omit<ImageProps, "src" | "alt"> & {
  src?: AcceptableSrc;
  alt?: string | null | undefined;
  fallbackSrc?: string;
  autoBlurPlaceholder?: boolean;
  wrapperClassName?: string;
  optimize?: boolean;
  preserveOnError?: boolean;
};

const DEFAULT_PLACEHOLDER = "/placeholder/default.jpg";
const CLOUD_NAME = process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] ?? "";

/* ------------------------------ helpers ------------------------------ */
function resolveSrc(
  input?: AcceptableSrc,
  fallback = DEFAULT_PLACEHOLDER,
): string | StaticImageData {
  if (!input) return fallback;
  if (typeof input === "object" && input !== null && "src" in input) return input;
  const raw = String(input).trim();
  if (!raw) return fallback;
  if (/^(https?:|data:|blob:)/i.test(raw) || raw.startsWith("/")) return raw;
  if (CLOUD_NAME) {
    const pid = raw.replace(/^\/+/, "");
    const encoded = pid.split("/").map(encodeURIComponent).join("/");
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto/${encoded}`;
  }
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
        <stop offset="0%" stop-color="var(--skeleton)"/>
        <stop offset="50%" stop-color="var(--border-subtle)"/>
        <stop offset="100%" stop-color="var(--skeleton)"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="var(--skeleton)"/>
    <rect id="r" width="${width}" height="${height}" fill="url(#g)"/>
    <animate xlink:href="#r" attributeName="x" from="-${width}" to="${width}" dur="1.2s" repeatCount="indefinite"/>
  </svg>`;
  const b64 =
    typeof window === "undefined"
      ? Buffer.from(svg).toString("base64")
      : btoa(svg);
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
  const initial = useMemo(
    () => resolveSrc(srcProp, fallbackSrc),
    [srcProp, fallbackSrc],
  );
  const [actualSrc, setActualSrc] = useState<string | StaticImageData>(initial);

  useEffect(() => {
    setActualSrc(initial);
  }, [initial]);

  // Capture props we want, strip from the DOM payload
  const {
    unoptimized: _ignoreUnoptimized,
    jsx: _ignoreJsx,
    placeholder: placeholderProp,
    blurDataURL: blurDataURLProp,
    fetchPriority: fetchPriorityProp,
    decoding: decodingProp,
    referrerPolicy: referrerPolicyProp,
    ...cleanRest
  } = rest as any;

  const handleError: NonNullable<ImageProps["onError"]> = (e) => {
    if (!preserveOnError && actualSrc !== fallbackSrc) {
      setActualSrc(fallbackSrc);
    }
    onError?.(e);
  };

  const handleLoad: NonNullable<ImageProps["onLoad"]> = (e) => {
    const imgEl = e.currentTarget as HTMLImageElement | null;
    if (
      !preserveOnError &&
      imgEl &&
      imgEl.naturalWidth === 0 &&
      actualSrc !== fallbackSrc
    ) {
      setActualSrc(fallbackSrc);
      return;
    }
    onLoad?.(e);
    if (onLoadingComplete && imgEl) onLoadingComplete(imgEl);
  };

  const safeAlt = alt && alt.trim().length > 0 ? alt : "image";

  const isSvg =
    typeof actualSrc === "string" && actualSrc.toLowerCase().includes(".svg");
  const isFill = !!(cleanRest as ImageProps).fill;

  // Default to unoptimized in tests; enable optimization when explicitly asked
  const unoptimized = optimize ? false : true;

  const sizes =
    sizesProp ??
    (isFill
      ? "(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 800px"
      : undefined);

  const w = toNumber((cleanRest as ImageProps).width);
  const h = toNumber((cleanRest as ImageProps).height);
  const inferredPriority = w !== undefined && h !== undefined && w <= 64 && h <= 64;
  const priority = priorityProp ?? inferredPriority ?? false;

  // Placeholder / blur logic
  const hasExplicitPlaceholder = placeholderProp != null;
  const hasExplicitBlurData = blurDataURLProp != null;

  const extra: Partial<ImageProps> = {};

  if (
    autoBlurPlaceholder &&
    !isSvg &&
    !hasExplicitPlaceholder &&
    !hasExplicitBlurData
  ) {
    extra.placeholder = "blur";
    extra.blurDataURL = tinyShimmer(24, 16);
  } else {
    if (hasExplicitPlaceholder) extra.placeholder = placeholderProp!;
    if (hasExplicitBlurData) extra.blurDataURL = blurDataURLProp!;
  }

  if (fetchPriorityProp) extra.fetchPriority = fetchPriorityProp;
  extra.decoding = decodingProp ?? "async";
  extra.referrerPolicy = referrerPolicyProp ?? "strict-origin-when-cross-origin";

  const rawSrcStr =
    typeof actualSrc === "string"
      ? actualSrc
      : (actualSrc as StaticImageData).src;

  const imgEl = (
    <Image
      {...(cleanRest as Omit<
        ImageProps,
        | "src"
        | "alt"
        | "placeholder"
        | "blurDataURL"
        | "fetchPriority"
        | "decoding"
        | "referrerPolicy"
      >)}
      {...extra}
      alt={safeAlt}
      src={actualSrc}
      onError={handleError}
      onLoad={handleLoad}
      unoptimized={unoptimized}
      sizes={sizes}
      loading={priority ? undefined : loadingProp ?? "lazy"}
      priority={priority}
      draggable={false}
      data-raw-src={rawSrcStr}
      data-no-opt={unoptimized ? "1" : "0"}
    />
  );

  return isFill ? (
    <span
      className={["relative block h-full w-full", wrapperClassName].join(" ")}
      aria-hidden={false}
    >
      {imgEl}
    </span>
  ) : (
    imgEl
  );
}
