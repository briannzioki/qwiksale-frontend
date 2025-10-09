// src/app/components/Gallery.tsx
"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import SmartImage from "@/app/components/SmartImage";
import LightboxModal from "@/app/components/LightboxModal.client";

type Props = {
  images: string[];
  /** Initial hero index (clamped). */
  initialIndex?: number;
  className?: string;

  /** When false, Gallery will NOT open a lightbox (still shows inline + thumbs). */
  lightbox?: boolean;

  /** next/image sizes hint for the inline image. */
  sizes?: string;

  /** Aspect ratio for the inline hero (Tailwind classes). Default: aspect-[4/3] sm:aspect-[16/10] */
  aspect?: string;

  /** Object fit for hero (cover/contain). Default: cover */
  fit?: "cover" | "contain";

  /** Optional callback when the current index changes. */
  onIndexChangeAction?: (nextIndex: number) => void;
};

export default function Gallery({
  images,
  initialIndex = 0,
  className = "",
  lightbox = true,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 800px",
  aspect = "aspect-[4/3] sm:aspect-[16/10]",
  fit = "cover",
  onIndexChangeAction,
}: Props) {
  // Clean + dedupe (by trimmed string)
  const safeImages = useMemo(() => {
    const set = new Set<string>();
    for (const u of Array.isArray(images) ? images : []) {
      const s = (u || "").trim();
      if (s && !set.has(s)) set.add(s);
    }
    return Array.from(set);
  }, [images]);

  const [idx, setIdx] = useState(
    Math.min(Math.max(0, initialIndex), Math.max(0, safeImages.length - 1))
  );
  const [open, setOpen] = useState<boolean>(false);

  // Clamp index if images change; prefer keeping current if still valid
  useEffect(() => {
    const len = safeImages.length;
    if (len === 0) return;
    setIdx((cur) => Math.min(Math.max(0, cur), len - 1));
  }, [safeImages]);

  // Notify parent of index changes
  useEffect(() => {
    onIndexChangeAction?.(idx);
  }, [idx, onIndexChangeAction]);

  // Preload neighbors for snappier next/prev
  useEffect(() => {
    const len = safeImages.length;
    if (len < 2) return;
    const prev = (idx - 1 + len) % len;
    const next = (idx + 1) % len;
    const a = new Image();
    const b = new Image();
    a.src = safeImages[prev]!;
    b.src = safeImages[next]!;
  }, [idx, safeImages]);

  if (!safeImages.length) {
    return (
      <div
        className="rounded-xl border p-4 text-sm text-gray-500 dark:border-slate-800 dark:text-slate-300"
        role="img"
        aria-label="No images available"
      >
        No images
      </div>
    );
  }

  // Tailwind helpers for object-fit
  const fitCls = fit === "contain" ? "object-contain" : "object-cover";
  const rootRef = useRef<HTMLDivElement | null>(null);

  const openLightbox = useCallback(() => lightbox && setOpen(true), [lightbox]);
  const go = useCallback(
    (next: number) => setIdx(Math.min(Math.max(0, next), safeImages.length - 1)),
    [safeImages.length]
  );
  const goPrev = useCallback(
    () => go((idx - 1 + safeImages.length) % safeImages.length),
    [idx, safeImages.length, go]
  );
  const goNext = useCallback(
    () => go((idx + 1) % safeImages.length),
    [idx, safeImages.length, go]
  );

  // Keyboard support on the inline hero area (not only in modal)
  const onHeroKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if ((e.key === "Enter" || e.key === " ") && lightbox) {
        e.preventDefault();
        setOpen(true);
      }
    },
    [goPrev, goNext, lightbox]
  );

  const heroId = "gallery-hero";
  const total = safeImages.length;

  return (
    <div
      ref={rootRef}
      className={["w-full", className].join(" ")}
      role="group"
      aria-roledescription="carousel"
      aria-label="Image gallery"
      aria-describedby={`${heroId}-desc`}
    >
      {/* Inline main image (aspect wrapper ensures height>0 for <Image fill>) */}
      <div
        className={`relative ${aspect} w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800`}
      >
        {/* We use a button overlay so the hero can be keyboard-focusable */}
        <SmartImage
          src={safeImages[idx]}
          alt={`Image ${idx + 1} of ${total}`}
          fill
          sizes={sizes}
          className={`${fitCls} pointer-events-none`}
          priority={false}
        />

        <button
          type="button"
          className="absolute inset-0 z-[2] focus:outline-none focus:ring-2 focus:ring-[#39a0ca]/60"
          aria-label={lightbox ? "Open image in fullscreen" : "Select image"}
          aria-describedby={`${heroId}-desc`}
          onClick={openLightbox}
          onKeyDown={onHeroKeyDown}
          id={heroId}
        />
        <span id={`${heroId}-desc`} className="sr-only">
          Use left and right arrow keys to change image.{" "}
          {lightbox ? "Press Enter to view fullscreen." : ""}
        </span>
      </div>

      {/* Thumbnails */}
      <div className="mt-2 grid grid-cols-5 gap-2 md:grid-cols-8" role="tablist" aria-label="Thumbnails">
        {safeImages.map((src, i) => {
          const selected = i === idx;
          return (
            <button
              key={`${src}:${i}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={heroId}
              className={[
                "relative aspect-square overflow-hidden rounded-lg border transition",
                selected
                  ? "ring-2 ring-[#39a0ca] border-transparent"
                  : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600",
              ].join(" ")}
              aria-label={`Show image ${i + 1} of ${total}`}
              onClick={() => go(i)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  const prev = Math.max(0, i - 1);
                  (e.currentTarget.parentElement?.querySelectorAll("button")?.[
                    prev
                  ] as HTMLButtonElement | undefined)?.focus();
                } else if (e.key === "ArrowRight") {
                  e.preventDefault();
                  const next = Math.min(total - 1, i + 1);
                  (e.currentTarget.parentElement?.querySelectorAll("button")?.[
                    next
                  ] as HTMLButtonElement | undefined)?.focus();
                } else if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  go(i);
                  if (lightbox) setOpen(true);
                }
              }}
            >
              <SmartImage
                src={src}
                alt={`Thumbnail ${i + 1}`}
                fill
                sizes="80px"
                className="object-cover"
              />
            </button>
          );
        })}
      </div>

      {/* Fullscreen modal via LightboxModal */}
      {lightbox && open && (
        <LightboxModal
          images={safeImages}
          index={idx}
          onIndexAction={(next) => go(next)}
          onCloseAction={() => setOpen(false)}
        />
      )}
    </div>
  );
}
