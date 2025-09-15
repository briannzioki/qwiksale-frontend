// src/app/components/UserAvatar.tsx
"use client";

import * as React from "react";

type SizeOption = number | "xs" | "sm" | "md" | "lg";

export type UserAvatarProps = {
  // ✅ allow undefined explicitly for exactOptionalPropertyTypes
  src?: string | null | undefined;
  alt?: string;
  size?: SizeOption;        // px number or semantic size
  className?: string;
  fallbackText?: string;    // initial(s)
  ring?: boolean;           // show subtle ring
  title?: string;           // optional tooltip
  loading?: "eager" | "lazy";
};

const sizeMap: Record<Exclude<SizeOption, number>, number> = {
  xs: 24,
  sm: 32,
  md: 36,
  lg: 64,
};

export default function UserAvatar({
  src,
  alt = "User avatar",
  size = "md",
  className = "",
  fallbackText,
  ring = true,
  title,
  loading = "lazy",
}: UserAvatarProps) {
  const [errored, setErrored] = React.useState(false);

  // Resolve numeric size
  const px = typeof size === "number" ? size : sizeMap[size];
  const dim = { width: px, height: px };
  const fontSize = Math.max(12, Math.floor(px * 0.45));

  // Derive fallback initial(s)
  const fallback = (fallbackText || (alt || "U").trim()[0] || "U").toUpperCase();

  const ringClasses = ring ? "ring-2 ring-black/10 dark:ring-white/20" : "";

  // Fallback (no src or load error)
  if (!src || errored) {
    return (
      <div
        role="img"
        aria-label={alt}
        title={title}
        className={`inline-flex select-none items-center justify-center rounded-full
                    bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-slate-100
                    ${ringClasses} ${className}`}
        style={dim}
      >
        <span style={{ fontSize }}>{fallback}</span>
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      title={title}
      width={px}
      height={px}
      loading={loading}
      decoding="async"
      onError={() => setErrored(true)}
      className={`rounded-full object-cover ${ringClasses} ${className}`}
      style={dim}
    />
  );
}
