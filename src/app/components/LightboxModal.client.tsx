"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useCallback } from "react";

type Props = {
  images: string[];
  index: number;
  /** Close the lightbox */
  onCloseAction: () => void;
  /** Set next index (0..images.length-1) */
  onIndexAction: (next: number) => void;
};

export default function LightboxModal({
  images,
  index,
  onCloseAction,
  onIndexAction,
}: Props) {
  const len = Math.max(0, images.length);
  const safeIndex = len ? Math.min(Math.max(0, index), len - 1) : 0;
  const src = len > 0 ? images[safeIndex] ?? images[0] : "";

  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const liveRef = useRef<HTMLSpanElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Remember opener focus & restore on unmount
  useEffect(() => {
    openerRef.current = (document.activeElement as HTMLElement) || null;
    return () => {
      try {
        openerRef.current?.focus();
      } catch {
        /* no-op */
      }
    };
  }, []);

  // Initial focus to Close button
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      closeBtnRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Live region for SR announcements
  useEffect(() => {
    if (!liveRef.current) return;
    if (!len) {
      liveRef.current.textContent = "No images";
      return;
    }
    liveRef.current.textContent = `Image ${safeIndex + 1} of ${len}`;
  }, [safeIndex, len]);

  // Focus trap (Tab cycles inside modal)
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusable = node.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, []);

  // ESC + Arrow keys + wheel nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseAction();
        return;
      }
      if (len > 1) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          onIndexAction((safeIndex + 1) % len);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          onIndexAction((safeIndex - 1 + len) % len);
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (len < 2) return;
      const magY = Math.abs(e.deltaY);
      const magX = Math.abs(e.deltaX);
      const delta = magX > magY ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 10) return;
      const next =
        delta > 0 ? (safeIndex + 1) % len : (safeIndex - 1 + len) % len;
      onIndexAction(next);
    };

    window.addEventListener("keydown", onKey);
    const root = rootRef.current;
    root?.addEventListener("wheel", onWheel, { passive: true });

    return () => {
      window.removeEventListener("keydown", onKey);
      root?.removeEventListener("wheel", onWheel as any);
    };
  }, [safeIndex, len, onCloseAction, onIndexAction]);

  // Disable page scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Basic swipe support on the image wrapper
  useEffect(() => {
    const node = wrapRef.current;
    if (!node || len < 2) return;

    let downX = 0;
    let downY = 0;
    let active = false;

    const onPointerDown = (e: PointerEvent) => {
      active = true;
      downX = e.clientX;
      downY = e.clientY;
      (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!active) return;
      active = false;
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (Math.abs(dx) > Math.max(40, Math.abs(dy) * 1.2)) {
        const next =
          dx < 0 ? (safeIndex + 1) % len : (safeIndex - 1 + len) % len;
        onIndexAction(next);
      }
    };
    const onPointerCancel = () => {
      active = false;
    };

    node.addEventListener("pointerdown", onPointerDown);
    node.addEventListener("pointerup", onPointerUp);
    node.addEventListener("pointercancel", onPointerCancel);

    return () => {
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointerup", onPointerUp);
      node.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [safeIndex, len, onIndexAction]);

  // Preload neighbors
  useEffect(() => {
    if (len < 2) return;
    const prevIdx = (safeIndex - 1 + len) % len;
    const nextIdx = (safeIndex + 1) % len;
    const a = new Image();
    const b = new Image();
    a.src = images[prevIdx]!;
    b.src = images[nextIdx]!;
  }, [safeIndex, len, images]);

  const goPrev = useCallback(() => {
    if (len < 2) return;
    onIndexAction((safeIndex - 1 + len) % len);
  }, [safeIndex, len, onIndexAction]);

  const goNext = useCallback(() => {
    if (len < 2) return;
    onIndexAction((safeIndex + 1) % len);
  }, [safeIndex, len, onIndexAction]);

  const dots = useMemo(() => Array.from({ length: len }, (_, i) => i), [len]);

  const stopClick = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  return (
    <div
      ref={rootRef}
      className={[
        "fixed inset-0 z-[100] flex items-center justify-center",
        // token-friendly scrim without hardcoded palette colors
        "bg-[color:color-mix(in_oklab,var(--text)_72%,transparent)] backdrop-blur-sm",
        "transition-opacity duration-200",
        "opacity-100",
      ].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      data-lightbox-root
      data-visible="true"
      data-gallery-overlay="true"
    >
      {/* SR announcer */}
      <span ref={liveRef} className="sr-only" aria-live="polite" />

      {/* Backdrop click → close (not tabbable) */}
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onCloseAction}
        tabIndex={-1}
        style={{ background: "transparent" }}
      />

      {/* Header: index + Close */}
      <div className="absolute left-0 right-0 top-0 z-[101] flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3">
        <div
          className={[
            "rounded-xl border border-[var(--border-subtle)]",
            "bg-[var(--bg-elevated)]",
            "px-2 py-0.5 sm:py-1 text-[11px] sm:text-xs font-semibold text-[var(--text)]",
            "shadow-sm",
          ].join(" ")}
          data-gallery-index-badge
          data-e2e="product-lightbox-index"
        >
          {len ? `${safeIndex + 1} / ${len}` : "0 / 0"}
        </div>

        <button
          ref={closeBtnRef}
          type="button"
          className={[
            "inline-flex items-center rounded-xl border border-[var(--border)]",
            "bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs sm:text-sm font-semibold text-[var(--text)]",
            "transition hover:bg-[var(--bg-subtle)]",
            "active:scale-[.99]",
            "focus-visible:outline-none focus-visible:ring-2 ring-focus",
          ].join(" ")}
          onClick={onCloseAction}
          aria-label="Close"
        >
          ✕ Close
        </button>
      </div>

      {/* Image area */}
      <div
        ref={wrapRef}
        onClick={stopClick}
        className={[
          "relative z-[101] max-h-[94svh] max-w-[94vw]",
          "rounded-2xl overflow-hidden",
          "border border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
          "p-2.5 sm:p-3",
          "shadow-soft",
          "transition-transform duration-200",
          "scale-100",
        ].join(" ")}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="max-h-[86svh] max-w-[90vw] sm:max-w-[86vw] select-none object-contain"
            draggable={false}
            loading="eager"
            decoding="async"
            onContextMenu={(e) => e.preventDefault()}
            data-gallery-image
          />
        ) : (
          <div className="flex h-[60svh] w-[70vw] items-center justify-center text-[var(--text-muted)]">
            No image
          </div>
        )}
      </div>

      {/* Prev/Next */}
      {len > 1 && (
        <>
          <button
            type="button"
            className={[
              "absolute left-1.5 top-1/2 z-[101] -translate-y-1/2 sm:left-2 md:left-6",
              "inline-flex items-center justify-center",
              "h-10 w-10 sm:h-11 sm:w-11",
              "rounded-xl border border-[var(--border-subtle)]",
              "bg-[var(--bg-elevated)] text-2xl sm:text-3xl text-[var(--text)]",
              "transition hover:bg-[var(--bg-subtle)]",
              "active:scale-[.99]",
              "focus-visible:outline-none focus-visible:ring-2 ring-focus",
            ].join(" ")}
            onClick={goPrev}
            aria-label="Previous image"
          >
            ‹
          </button>
          <button
            type="button"
            className={[
              "absolute right-1.5 top-1/2 z-[101] -translate-y-1/2 sm:right-2 md:right-6",
              "inline-flex items-center justify-center",
              "h-10 w-10 sm:h-11 sm:w-11",
              "rounded-xl border border-[var(--border-subtle)]",
              "bg-[var(--bg-elevated)] text-2xl sm:text-3xl text-[var(--text)]",
              "transition hover:bg-[var(--bg-subtle)]",
              "active:scale-[.99]",
              "focus-visible:outline-none focus-visible:ring-2 ring-focus",
            ].join(" ")}
            onClick={goNext}
            aria-label="Next image"
          >
            ›
          </button>
        </>
      )}

      {/* Index dots */}
      {len > 1 && (
        <div className="absolute bottom-2 sm:bottom-3 left-1/2 z-[101] -translate-x-1/2 flex items-center gap-1.5 sm:gap-2">
          {dots.map((i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to image ${i + 1}`}
              onClick={() => onIndexAction(i)}
              className={[
                "h-2.5 w-2.5 rounded-full border transition",
                "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                i === safeIndex
                  ? "border-[var(--border)] bg-[var(--bg-elevated)] shadow-sm"
                  : "border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-elevated)]",
              ].join(" ")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
