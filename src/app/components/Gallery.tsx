"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState, useCallback, useId } from "react";
import LightboxModal from "@/app/components/LightboxModal.client";

const PLACEHOLDER = "/placeholder/default.jpg";

type Props = {
  images: string[];
  /** Initial hero index (clamped). */
  initialIndex?: number;
  className?: string;

  /** When false, Gallery will NOT open a lightbox (still shows inline + thumbs). */
  lightbox?: boolean;

  /** CSS sizes hint for the inline image (purely informational for tests). */
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
  /* ---------------- Normalize & state ---------------- */
  // IMPORTANT: do not dedupe or slice; render *all* items provided.
  const safeImages = useMemo(
    () =>
      Array.isArray(images)
        ? images.map((u) => String(u ?? "").trim()).filter(Boolean)
        : [],
    [images]
  );

  // Always have at least one image (placeholder) for stable UI/tests
  const imgs = useMemo(() => (safeImages.length ? safeImages : [PLACEHOLDER]), [safeImages]);

  const [idx, setIdx] = useState(
    Math.min(Math.max(0, initialIndex), Math.max(0, imgs.length - 1))
  );
  const [open, setOpen] = useState<boolean>(false);

  // Keep index valid if images change
  useEffect(() => {
    const len = imgs.length;
    if (len === 0) return;
    setIdx((cur) => Math.min(Math.max(0, cur), len - 1));
  }, [imgs]);

  // Notify parent on index changes
  useEffect(() => {
    onIndexChangeAction?.(idx);
  }, [idx, onIndexChangeAction]);

  // Preload neighbors for snappier nav
  useEffect(() => {
    const len = imgs.length;
    if (len < 2) return;
    const prev = (idx - 1 + len) % len;
    const next = (idx + 1) % len;
    const a = new Image();
    const b = new Image();
    a.src = imgs[prev]!;
    b.src = imgs[next]!;
  }, [idx, imgs]);

  /* ---------------- Helpers ---------------- */
  const fitCls = fit === "contain" ? "object-contain" : "object-cover";
  const openLightbox = useCallback(() => lightbox && setOpen(true), [lightbox]);

  const goClamp = useCallback(
    (next: number) => setIdx(Math.min(Math.max(0, next), imgs.length - 1)),
    [imgs.length]
  );
  const goPrev = useCallback(
    () => goClamp((idx - 1 + imgs.length) % imgs.length),
    [idx, imgs.length, goClamp]
  );
  const goNext = useCallback(
    () => goClamp((idx + 1) % imgs.length),
    [idx, imgs.length, goClamp]
  );

  // Keyboard on hero
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

  // Touch swipe on hero
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
  }, []);
  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStartX.current;
      touchStartX.current = null;
      if (start == null) return;
      const end = e.changedTouches[0]?.clientX ?? start;
      const dx = end - start;
      if (Math.abs(dx) > 40) {
        if (dx > 0) goPrev();
        else goNext();
      }
    },
    [goPrev, goNext]
  );

  /* ---------------- Thumbnails strip ---------------- */
  const thumbRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  useEffect(() => {
    const node = thumbRefs.current[idx];
    node?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [idx]);

  const heroId = useId();
  const total = imgs.length;

  return (
    <div
      className={["w-full", className].join(" ")}
      role="group"
      aria-roledescription="carousel"
      aria-label="Image gallery"
      aria-describedby={`${heroId}-desc`}
      data-gallery="true"
      /** expose state for CSS guards/tests */
      data-gallery-open={open ? "true" : "false"}
    >
      {/* ===== Hero ===== */}
      <div
        className={`relative ${aspect} w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800`}
        data-gallery-wrap
        data-gallery-hero
      >
        {/* Visible native <img> so tests can see literal src (no Next optimizer) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgs[idx]}
          alt={`Image ${idx + 1} of ${total}`}
          decoding="async"
          draggable={false}
          loading="eager"
          className={`absolute inset-0 h-full w-full ${fitCls} select-none`}
          data-gallery-image
          data-gallery-hero-img
          data-sizes={sizes}
        />

        {/* Interactive overlay so hero is focusable/clickable */}
        <button
          type="button"
          className="absolute inset-0 z-[2] focus:outline-none focus:ring-2 focus:ring-[#39a0ca]/60"
          aria-label={lightbox ? "Open image in fullscreen" : "Select image"}
          aria-describedby={`${heroId}-desc`}
          onClick={openLightbox}
          onKeyDown={onHeroKeyDown}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          id={heroId}
          /* IMPORTANT: shared selector for tests BEFORE opening */
          data-gallery-overlay="true"
        />

        <span id={`${heroId}-desc`} className="sr-only">
          Use left and right arrow keys to change image. {lightbox ? "Press Enter to view fullscreen." : ""}
        </span>

        {/* Prev / Next buttons */}
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="btn-outline absolute left-3 top-1/2 z-[3] -translate-y-1/2 px-2 py-1 text-xs"
              aria-label="Previous image"
              title="Previous"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={goNext}
              className="btn-outline absolute right-3 top-1/2 z-[3] -translate-y-1/2 px-2 py-1 text-xs"
              aria-label="Next image"
              title="Next"
            >
              ›
            </button>
          </>
        )}

        {/* Tiny index badge — HIDE while lightbox is open to avoid duplicate counter */}
        {total > 1 && !open && (
          <div
            className="absolute left-3 bottom-3 z-[3] rounded-md bg-black/60 px-2 py-0.5 text-xs text-white"
            data-gallery-index-badge
          >
            {idx + 1} / {total}
          </div>
        )}
      </div>

      {/* ===== Thumbnails (horizontal strip) ===== */}
      {total > 1 && (
        <div className="mt-2 border-t pt-2 dark:border-white/10" data-gallery-thumbs>
          <ul
            className="flex gap-2 overflow-x-auto p-1 no-scrollbar"
            role="tablist"
            aria-label="Thumbnails"
            onWheel={(e: React.WheelEvent<HTMLUListElement>) => {
              const el = e.currentTarget;
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
            }}
          >
            {imgs.map((src, i) => {
              const selected = i === idx;
              return (
                <li key={`${src}:${i}`} className="relative">
                  <button
                    ref={(el) => {
                      thumbRefs.current[i] = el;
                    }}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={heroId}
                    className={[
                      "relative block h-16 w-24 overflow-hidden rounded-lg border",
                      "bg-white dark:bg-slate-900",
                      selected
                        ? "ring-2 ring-[#39a0ca] border-transparent"
                        : "border-black/10 dark:border-white/10 hover:ring-1 hover:ring-[#39a0ca]/60",
                    ].join(" ")}
                    aria-label={`Show image ${i + 1} of ${total}`}
                    title={selected ? "Current image" : `Image ${i + 1}`}
                    onClick={() => setIdx(i)}
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
                        setIdx(i);
                        if (lightbox) setOpen(true);
                      }
                    }}
                    data-gallery-thumb
                  >
                    {/* Visible native thumbnail (no optimizer) */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`Thumbnail ${i + 1}`}
                      decoding="async"
                      draggable={false}
                      loading="lazy"
                      className="h-full w-full object-cover"
                      data-gallery-image
                      data-gallery-thumb-img
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ===== Lightbox ===== */}
      {lightbox && open && (
        <div
          data-gallery-overlay="true"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60]"
        >
          <LightboxModal
            images={imgs}
            index={idx}
            onIndexAction={(next) => goClamp(next)}
            onCloseAction={() => setOpen(false)}
          />
        </div>
      )}

      {/* Scoped helpers */}
      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
