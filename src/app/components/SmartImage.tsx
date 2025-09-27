// src/app/components/SmartImage.tsx
"use client";

import Image, { type ImageProps } from "next/image";
import type { StaticImageData } from "next/image";
import { useMemo, useState, useEffect } from "react";

type AcceptableSrc = string | StaticImageData | null | undefined;

type Props = Omit<ImageProps, "src" | "alt"> & {
  /** Cloudinary public ID, absolute URL, data/blob URL, site-relative path, or StaticImageData. */
  src?: AcceptableSrc; // allow undefined to satisfy exactOptionalPropertyTypes
  /** Optional alt; defaults to a safe string if omitted/empty. */
  alt?: string | null | undefined;
  /** Optional hard fallback image path/URL; defaults to local placeholder. */
  fallbackSrc?: string;
};

/** Local placeholder (ensure this file exists). */
const DEFAULT_PLACEHOLDER = "/placeholder/default.jpg";
const CLOUD_NAME = process.env['NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME'] ?? "";

/** Build a safe display URL/value from a possibly-partial input. */
function resolveSrc(input?: AcceptableSrc, fallback = DEFAULT_PLACEHOLDER): string | StaticImageData {
  if (!input) return fallback;

  // If this is a Next static import, just pass it through.
  if (typeof input === "object" && "src" in input) return input;

  const raw = String(input).trim();
  if (!raw) return fallback;

  // Absolute / special schemes or site-relative file (e.g. /placeholder/default.jpg)
  if (/^(https?:|data:|blob:)/i.test(raw) || raw.startsWith("/")) return raw;

  // Treat anything else as a Cloudinary public_id if cloud name is configured
  if (CLOUD_NAME) {
    // remove accidental leading slash to avoid double slashes
    const pid = raw.replace(/^\/+/, "");
    // encode each segment but preserve folder slashes
    const encoded = pid.split("/").map(encodeURIComponent).join("/");
    // f_auto,q_auto gives good defaults; tweak as needed
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto/${encoded}`;
  }

  // No Cloudinary config and not an absolute path — fall back
  return fallback;
}

export default function SmartImage({
  src: srcProp,
  alt,
  onError,
  onLoadingComplete,
  fallbackSrc = DEFAULT_PLACEHOLDER,
  ...rest
}: Props) {
  // Derive the initial resolved source
  const initial = useMemo(() => resolveSrc(srcProp, fallbackSrc), [srcProp, fallbackSrc]);

  // Track the actual src used by <Image>; swap to placeholder if it errors
  const [actualSrc, setActualSrc] = useState<string | StaticImageData>(initial);

  // If the input src changes (e.g. index switched in a gallery), reset
  useEffect(() => {
    setActualSrc(initial);
  }, [initial]);

  const handleError: NonNullable<ImageProps["onError"]> = (e) => {
    // Only swap once to avoid loops if placeholder ever fails
    if (actualSrc !== fallbackSrc) setActualSrc(fallbackSrc);
    // Bubble up
    onError?.(e);
  };

  // Some broken images load with 200 but have 0×0 natural size; treat as failure.
  const handleLoadingComplete: NonNullable<ImageProps["onLoadingComplete"]> = (img) => {
    if (img?.naturalWidth === 0 && actualSrc !== fallbackSrc) {
      setActualSrc(fallbackSrc);
      return; // don't bubble incomplete loads
    }
    onLoadingComplete?.(img);
  };

  // Guarantee a non-empty alt (accessibility)
  const safeAlt = (alt && alt.trim().length > 0 ? alt : "image") as string;

  // Skip Next optimization for local placeholder and SVGs (common perf+compat choice)
  const isSvg = typeof actualSrc === "string" && actualSrc.toLowerCase().endsWith(".svg");
  const unoptimized = actualSrc === fallbackSrc || isSvg;

  return (
    <Image
      {...rest}
      alt={safeAlt}
      src={actualSrc}
      onError={handleError}
      onLoadingComplete={handleLoadingComplete}
      unoptimized={unoptimized}
      loading={(rest as ImageProps).loading ?? "lazy"}
    />
  );
}
