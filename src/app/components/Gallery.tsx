"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState, useCallback, useId } from "react";
import LightboxModal from "@/app/components/LightboxModal.client";
import { cx, pillClass, pillIconClass, pillGroupClass } from "@/app/components/ui/pill";

type Props = {
  images?: string[] | null;
  initialIndex?: number;
  className?: string;
  lightbox?: boolean;
  sizes?: string;
  aspect?: string;
  fit?: "cover" | "contain";
  onIndexChangeAction?: (nextIndex: number) => void;

  /**
   * ✅ NEW:
   * When images is empty, Gallery still must render a visible <img> so
   * detail pages/tests always have a stable DOM contract.
   */
  emptySrc?: string;
};

const DEFAULT_EMPTY_SRC = "/placeholder/default.jpg";

export default function Gallery({
  images = [],
  initialIndex = 0,
  className = "",
  lightbox = true,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 800px",
  aspect = "aspect-[4/3] sm:aspect-[16/10]",
  fit = "cover",
  onIndexChangeAction,
  emptySrc = DEFAULT_EMPTY_SRC,
}: Props) {
  const safeImages = useMemo(
    () =>
      Array.isArray(images)
        ? images
            .map((u) => String(u ?? "").trim())
            .filter(Boolean)
        : [],
    [images],
  );

  const imgs = safeImages;
  const total = imgs.length;

  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);

  // Normalize index whenever images / initialIndex change
  useEffect(() => {
    const len = imgs.length;
    if (!len) {
      setIdx(0);
      return;
    }

    const clampedInitial = Math.min(Math.max(0, initialIndex), len - 1);

    setIdx((cur) => {
      if (!Number.isFinite(cur) || cur < 0 || cur >= len) {
        return clampedInitial;
      }
      return cur;
    });
  }, [imgs, initialIndex]);

  useEffect(() => {
    if (!total) return;
    onIndexChangeAction?.(idx);
  }, [idx, total, onIndexChangeAction]);

  // Prefetch neighbors for smoother transitions
  useEffect(() => {
    if (total < 2) return;
    const prev = (idx - 1 + total) % total;
    const next = (idx + 1) % total;

    const a = new Image();
    const b = new Image();
    a.src = imgs[prev]!;
    b.src = imgs[next]!;
  }, [idx, imgs, total]);

  const fitCls = fit === "contain" ? "object-contain" : "object-cover";

  const goClamp = useCallback(
    (n: number) => {
      setIdx((cur) => {
        const len = imgs.length;
        if (!len) return 0;
        const next = Number.isFinite(n) ? n : cur;
        return Math.min(Math.max(0, next), len - 1);
      });
    },
    [imgs.length],
  );

  const goPrev = useCallback(() => {
    setIdx((cur) => {
      const len = imgs.length;
      if (len <= 1) return cur;
      return (cur - 1 + len) % len;
    });
  }, [imgs.length]);

  const goNext = useCallback(() => {
    setIdx((cur) => {
      const len = imgs.length;
      if (len <= 1) return cur;
      return (cur + 1) % len;
    });
  }, [imgs.length]);

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
    [goPrev, goNext, lightbox],
  );

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
    [goPrev, goNext],
  );

  const thumbRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  useEffect(() => {
    const node = thumbRefs.current[idx];
    node?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [idx]);

  const heroId = useId();

  /**
   * ✅ IMPORTANT FIX:
   * If no images, still render a placeholder <img> inside [data-gallery-wrap].
   * This matches your product/service “always show at least one image” contract
   * and makes `[data-gallery-wrap] img` selectors reliable.
   */
  if (!total) {
    const fallback = String(emptySrc ?? "").trim() || DEFAULT_EMPTY_SRC;

    return (
      <div
        className={["w-full", className].join(" ")}
        role="group"
        aria-roledescription="carousel"
        aria-label="Image gallery"
        aria-describedby={`${heroId}-desc`}
        data-gallery="true"
        data-gallery-open="false"
      >
        <div
          className={[
            "relative w-full overflow-hidden rounded-2xl",
            "min-h-[160px] min-[420px]:min-h-[176px] sm:min-h-[220px]",
            aspect,
            "bg-[var(--bg-subtle)] border border-[var(--border-subtle)]",
          ].join(" ")}
          style={{ position: "relative" }}
          data-gallery-wrap
          data-gallery-hero
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fallback}
            alt="Image placeholder"
            decoding="async"
            draggable={false}
            loading="eager"
            fetchPriority="high"
            className={`absolute inset-0 h-full w-full ${fitCls} select-none`}
            data-gallery-image
            data-gallery-hero-img
            sizes={sizes}
            data-sizes={sizes}
          />

          <span id={`${heroId}-desc`} className="sr-only">
            No images available.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={["w-full", className].join(" ")}
      role="group"
      aria-roledescription="carousel"
      aria-label="Image gallery"
      aria-describedby={`${heroId}-desc`}
      data-gallery="true"
      data-gallery-open={open ? "true" : "false"}
    >
      {/* Hero */}
      <div
        className={[
          "relative w-full overflow-hidden rounded-2xl",
          "min-h-[160px] min-[420px]:min-h-[176px] sm:min-h-[220px]",
          aspect,
          "bg-[var(--bg-subtle)] border border-[var(--border-subtle)]",
        ].join(" ")}
        style={{ position: "relative" }}
        data-gallery-wrap
        data-gallery-hero
      >
        <button
          type="button"
          className={pillIconClass({
            active: false,
            className: cx(
              "absolute right-2 top-2 z-[3]",
              "inline-flex h-9 w-9 items-center justify-center",
              "rounded-full p-0 text-sm font-semibold",
              "bg-[var(--bg-elevated)] text-[var(--text)]",
              "border border-[var(--border-subtle)] shadow-sm",
            ),
          })}
          onClick={() => lightbox && setOpen(true)}
          aria-hidden="true"
          tabIndex={-1}
          data-gallery-fullscreen-trigger="true"
        >
          ⤢
        </button>

        {/* Hero image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgs[idx]}
          alt={`Image ${idx + 1} of ${total}`}
          decoding="async"
          draggable={false}
          loading="eager"
          fetchPriority="high"
          className={`absolute inset-0 h-full w-full ${fitCls} select-none pointer-events-none`}
          data-gallery-image
          data-gallery-hero-img
          sizes={sizes}
          data-sizes={sizes}
        />

        {/* Keyboard + touch overlay */}
        <button
          type="button"
          className={[
            "absolute inset-0 z-[2]",
            "focus-visible:outline-none focus-visible:ring-2 ring-focus",
          ].join(" ")}
          aria-label={lightbox ? "Open image in fullscreen" : "Select image"}
          aria-describedby={`${heroId}-desc`}
          onClick={() => lightbox && setOpen(true)}
          onKeyDown={onHeroKeyDown}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          id={heroId}
          data-gallery-overlay="true"
          data-gallery-opener="true"
        />

        <span id={`${heroId}-desc`} className="sr-only">
          Use left and right arrow keys to change image.
          {lightbox ? " Press Enter to view fullscreen." : ""}
        </span>

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="btn-outline absolute left-2 top-1/2 z-[3] -translate-y-1/2 h-9 w-9 p-0 text-lg leading-none"
              aria-label="Previous image"
              title="Previous"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={goNext}
              className="btn-outline absolute right-2 top-1/2 z-[3] -translate-y-1/2 h-9 w-9 p-0 text-lg leading-none"
              aria-label="Next image"
              title="Next"
            >
              ›
            </button>
          </>
        )}

        {total > 1 && !open && (
          <div
            className={[
              "absolute left-2 bottom-2 z-[3]",
              "rounded-xl px-2 py-0.5 text-[11px] font-semibold",
              "bg-[var(--bg-elevated)] text-[var(--text)]",
              "border border-[var(--border-subtle)] shadow-sm",
            ].join(" ")}
            data-gallery-index-badge
          >
            {idx + 1} / {total}
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {total > 1 && (
        <div
          className="mt-1.5 sm:mt-2 border-t border-[var(--border-subtle)] pt-1.5 sm:pt-2"
          data-gallery-thumbs
        >
          <ul
            className={pillGroupClass("no-scrollbar w-full max-w-full overflow-x-auto")}
            role="tablist"
            aria-label="Thumbnails"
            onWheel={(e: React.WheelEvent<HTMLUListElement>) => {
              const el = e.currentTarget;
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                el.scrollLeft += e.deltaY;
              }
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
                    className={pillClass({
                      active: selected,
                      size: "sm",
                      className: cx(
                        "ring-focus transition",
                        "relative block overflow-hidden",
                        "h-14 w-20 sm:h-16 sm:w-24",
                        "bg-[var(--bg-elevated)]",
                        "p-0",
                        selected
                          ? "border-[var(--border)] ring-2"
                          : "border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] hover:ring-1 hover:ring-focus",
                      ),
                    })}
                    aria-label={`Show image ${i + 1} of ${total}`}
                    title={selected ? "Current image" : `Image ${i + 1}`}
                    onClick={() => setIdx(i)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        const prev = Math.max(0, i - 1);
                        (
                          e.currentTarget.parentElement?.querySelectorAll("button")?.[
                            prev
                          ] as HTMLButtonElement | undefined
                        )?.focus();
                      } else if (e.key === "ArrowRight") {
                        e.preventDefault();
                        const next = Math.min(total - 1, i + 1);
                        (
                          e.currentTarget.parentElement?.querySelectorAll("button")?.[
                            next
                          ] as HTMLButtonElement | undefined
                        )?.focus();
                      } else if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setIdx(i);
                        if (lightbox) setOpen(true);
                      }
                    }}
                    data-gallery-thumb
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`Thumbnail ${i + 1}`}
                      decoding="async"
                      draggable={false}
                      loading="lazy"
                      className="h-full w-full cursor-pointer object-cover pointer-events-none"
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

      {/* Shadow list for tests (one source of truth) */}
      {total > 0 && (
        <div className="hidden" aria-hidden="true" data-gallery-shadow>
          {imgs.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`shadow-${src}:${i}`}
              src={src}
              alt=""
              data-gallery-image
              data-gallery-shadow-img
            />
          ))}
        </div>
      )}

      {lightbox && open && (
        <div
          data-gallery-lightbox="true"
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

      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
