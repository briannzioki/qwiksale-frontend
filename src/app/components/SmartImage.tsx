// src/app/components/SmartImage.tsx
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
};

const DEFAULT_PLACEHOLDER = "/placeholder/default.jpg";
const CLOUD_NAME = process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] ?? "";

/** Build a safe display URL/value from a possibly-partial input. */
function resolveSrc(input?: AcceptableSrc, fallback = DEFAULT_PLACEHOLDER): string | StaticImageData {
  if (!input) return fallback;
  if (typeof input === "object" && input !== null && "src" in input) return input; // StaticImageData
  const raw = String(input).trim();
  if (!raw) return fallback;
  if (/^(https?:|data:|blob:)/i.test(raw) || raw.startsWith("/")) return raw;

  if (CLOUD_NAME) {
    const pid = raw.replace(/^\/+/, "");
    const encoded = pid.split("/").map(encodeURIComponent).join("/");
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto/${encoded}`;
  }
  return fallback;
}

function toNumber(n?: number | `${number}`): number | undefined {
  if (typeof n === "number") return n;
  if (typeof n === "string") {
    const v = parseFloat(n);
    return Number.isFinite(v) ? v : undefined;
  }
  return undefined;
}

export default function SmartImage({
  src: srcProp,
  alt,
  onError,
  onLoad,
  onLoadingComplete, // still supported; we’ll call it inside onLoad
  fallbackSrc = DEFAULT_PLACEHOLDER,
  sizes: sizesProp,
  loading: loadingProp,
  priority: priorityProp,
  ...rest
}: Props) {
  const initial = useMemo(() => resolveSrc(srcProp, fallbackSrc), [srcProp, fallbackSrc]);
  const [actualSrc, setActualSrc] = useState<string | StaticImageData>(initial);

  useEffect(() => {
    setActualSrc(initial);
  }, [initial]);

  const handleError: NonNullable<ImageProps["onError"]> = (e) => {
    if (actualSrc !== fallbackSrc) setActualSrc(fallbackSrc);
    onError?.(e);
  };

  const handleLoad: NonNullable<ImageProps["onLoad"]> = (e) => {
    const imgEl = e.currentTarget as HTMLImageElement | null;
    if (imgEl && imgEl.naturalWidth === 0 && actualSrc !== fallbackSrc) {
      setActualSrc(fallbackSrc);
      return;
    }
    onLoad?.(e);
    if (onLoadingComplete && imgEl) onLoadingComplete(imgEl);
  };

  const safeAlt = (alt && alt.trim().length > 0 ? alt : "image") as string;

  const isSvg = typeof actualSrc === "string" && actualSrc.toLowerCase().endsWith(".svg");
  const unoptimized = actualSrc === fallbackSrc || isSvg;

  const fill = (rest as ImageProps).fill === true;
  const sizes =
    sizesProp ??
    (fill ? "(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 800px" : undefined);

  const loading = loadingProp ?? "lazy";

  // Coerce width/height (can be number or template-literal string)
  const w = toNumber((rest as ImageProps).width);
  const h = toNumber((rest as ImageProps).height);

  // Tiny assets (icons/avatars) can be eager without hurting perf
  const inferredPriority = w !== undefined && h !== undefined && w <= 64 && h <= 64;
  const priority = priorityProp ?? inferredPriority ?? false;

  return (
    <Image
      {...rest}
      alt={safeAlt}
      src={actualSrc}
      onError={handleError}
      onLoad={handleLoad}
      unoptimized={unoptimized}
      sizes={sizes}
      loading={priority ? undefined : loading}
      priority={priority}
      decoding={(rest as ImageProps).decoding ?? "async"}
    />
  );
}
