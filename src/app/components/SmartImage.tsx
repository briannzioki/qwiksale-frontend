// src/app/components/SmartImage.tsx
"use client";

import Image, { type ImageProps } from "next/image";
import { useMemo, useState, useEffect } from "react";

type Props = Omit<ImageProps, "src" | "alt"> & {
  /** Cloudinary public ID, absolute URL, data/blob URL, or site-relative path. */
  src?: string | null | undefined; // allow undefined to satisfy exactOptionalPropertyTypes
  /** Optional alt; defaults to a safe string if omitted/empty. */
  alt?: string | null | undefined;
};

/** Local placeholder (ensure this file exists). */
const PLACEHOLDER = "/placeholder/default.jpg";
const CLOUD_NAME = process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] ?? "";

/** Build a safe display URL from a possibly-partial input. */
function resolveSrc(input?: string | null): string {
  const raw = (input || "").trim();
  if (!raw) return PLACEHOLDER;

  // Absolute / special schemes or site-relative file (e.g. /placeholder/default.jpg)
  if (/^(https?:|data:|blob:)/i.test(raw) || raw.startsWith("/")) return raw;

  // Treat anything else as a Cloudinary public_id if cloud name is configured
  if (CLOUD_NAME) {
    // remove accidental leading slash to avoid double slashes
    const pid = raw.replace(/^\/+/, "");
    // encode each segment but preserve folder slashes
    const encoded = pid
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");
    // f_auto,q_auto gives good defaults; tweak as needed
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto/${encoded}`;
  }

  // No Cloudinary config and not an absolute path — fall back
  return PLACEHOLDER;
}

export default function SmartImage({ src: srcProp, alt, onError, ...rest }: Props) {
  // Derive the initial resolved source
  const initial = useMemo(() => resolveSrc(srcProp), [srcProp]);

  // Track the actual src used by <Image>; swap to placeholder if it errors
  const [actualSrc, setActualSrc] = useState<string>(initial);

  // If the input src changes (e.g. index switched in a gallery), reset
  useEffect(() => {
    setActualSrc(initial);
  }, [initial]);

  const handleError: NonNullable<ImageProps["onError"]> = (e) => {
    // Only swap once to avoid loops if placeholder ever fails
    if (actualSrc !== PLACEHOLDER) {
      setActualSrc(PLACEHOLDER);
    }
    // Call through if the parent passed an onError
    onError?.(e as any);
  };

  // Guarantee a non-empty alt (accessibility)
  const safeAlt = (alt && alt.trim().length > 0 ? alt : "image") as string;

  // Skip Next optimization for local placeholder and SVGs (common perf+compat choice)
  const isSvg = useMemo(() => actualSrc.toLowerCase().endsWith(".svg"), [actualSrc]);
  const unoptimized = actualSrc === PLACEHOLDER || isSvg;

  return (
    <Image
      {...rest}
      alt={safeAlt}
      src={actualSrc}
      onError={handleError}
      unoptimized={unoptimized}
      loading={(rest as ImageProps).loading ?? "lazy"}
    />
  );
}
