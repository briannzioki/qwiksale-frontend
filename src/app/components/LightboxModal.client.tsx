"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";

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
  const src = images[safeIndex] ?? images[0];

  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const liveRef = useRef<HTMLSpanElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // mount animation
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Remember the element that had focus and restore on close/unmount
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

  // Initial focus to the Close button
  useEffect(() => {
    const id = requestAnimationFrame(() => closeBtnRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  // Announce changes for screen readers
  useEffect(() => {
    if (!liveRef.current) return;
    liveRef.current.textContent = len ? `Image ${safeIndex + 1} of ${len}` : "No images";
  }, [safeIndex, len]);

  // Focus trap (Tab cycles inside the modal)
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusable = node.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
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

  // Esc / Arrow keys + wheel navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseAction();
      if (len > 1) {
        if (e.key === "ArrowRight") onIndexAction((safeIndex + 1) % len);
        if (e.key === "ArrowLeft") onIndexAction((safeIndex - 1 + len) % len);
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (len < 2) return;
      const magY = Math.abs(e.deltaY);
      const magX = Math.abs(e.deltaX);
      const delta = magX > magY ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 10) return;
      onIndexAction(delta > 0 ? (safeIndex + 1) % len : (safeIndex - 1 + len) % len);
    };

    window.addEventListener("keydown", onKey);
    const root = rootRef.current;
    root?.addEventListener("wheel", onWheel, { passive: true });

    return () => {
      window.removeEventListener("keydown", onKey);
      root?.removeEventListener("wheel", onWheel as any);
    };
  }, [safeIndex, len, onCloseAction, onIndexAction]);

  // Prevent page scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Basic swipe support
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
        onIndexAction(dx < 0 ? (safeIndex + 1) % len : (safeIndex - 1 + len) % len);
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

  // Preload neighbors (snappier nav)
  useEffect(() => {
    if (len < 2) return;
    const prevIdx = (safeIndex - 1 + len) % len;
    const nextIdx = (safeIndex + 1) % len;
    const a = new Image();
    const b = new Image();
    a.src = images[prevIdx]!;
    b.src = images[nextIdx]!;
  }, [safeIndex, len, images]);

  const goPrev = useCallback(
    () => onIndexAction((safeIndex - 1 + len) % len),
    [safeIndex, len, onIndexAction]
  );
  const goNext = useCallback(
    () => onIndexAction((safeIndex + 1) % len),
    [safeIndex, len, onIndexAction]
  );

  const dots = useMemo(() => Array.from({ length: len }, (_, i) => i), [len]);

  const stopClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div
      ref={rootRef}
      className={[
        "fixed inset-0 z-[100] flex items-center justify-center",
        "bg-black/70 backdrop-blur-sm",
        "transition-opacity duration-200",
        mounted ? "opacity-100" : "opacity-0",
      ].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      data-lightbox-root
      data-visible="true"
      /* OPTIONAL redundancy: same selector also present AFTER open */
      data-gallery-overlay="true"
    >
      {/* a11y announcer */}
      <span ref={liveRef} className="sr-only" aria-live="polite" />

      {/* click-outside/backdrop to close */}
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onCloseAction}
        tabIndex={-1}
        style={{ background: "transparent" }}
      />

      {/* header controls */}
      <div className="absolute left-0 right-0 top-0 z-[101] flex items-center justify-between px-4 py-3">
        <div className="rounded bg-black/30 px-2 py-1 text-xs font-medium text-white/90">
          {len ? `${safeIndex + 1} / ${len}` : "0 / 0"}
        </div>
        <button
          ref={closeBtnRef}
          type="button"
          className="inline-flex items-center rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/70"
          onClick={onCloseAction}
          aria-label="Close"
        >
          ✕ Close
        </button>
      </div>

      {/* image area */}
      <div
        ref={wrapRef}
        onClick={stopClick}
        className={[
          "relative z-[101] max-h-[92vh] max-w-[92vw]",
          "rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10",
          "bg-black/40 p-2 md:p-3",
          "transition-transform duration-200",
          mounted ? "scale-100" : "scale-95",
        ].join(" ")}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="max-h-[86vh] max-w-[86vw] select-none object-contain"
            draggable={false}
            loading="eager"
            decoding="async"
            onContextMenu={(e) => e.preventDefault()}
            data-gallery-image
          />
        ) : (
          <div className="flex h-[60vh] w-[70vw] items-center justify-center text-white/70">
            No image
          </div>
        )}
      </div>

      {/* left/right nav */}
      {len > 1 && (
        <>
          <button
            type="button"
            className="absolute left-2 top-1/2 z-[101] -translate-y-1/2 rounded-full px-3 py-1.5 text-3xl text-white/90 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/70 md:left-6"
            onClick={goPrev}
            aria-label="Previous image"
          >
            ‹
          </button>
          <button
            type="button"
            className="absolute right-2 top-1/2 z-[101] -translate-y-1/2 rounded-full px-3 py-1.5 text-3xl text-white/90 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/70 md:right-6"
            onClick={goNext}
            aria-label="Next image"
          >
            ›
          </button>
        </>
      )}

      {/* index dots */}
      {len > 1 && (
        <div className="absolute bottom-3 left-1/2 z-[101] -translate-x-1/2 flex items-center gap-2">
          {dots.map((i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to image ${i + 1}`}
              onClick={() => onIndexAction(i)}
              className={[
                "h-2.5 w-2.5 rounded-full border border-white/40 transition",
                i === safeIndex ? "bg-white" : "bg-white/20 hover:bg-white/40",
              ].join(" ")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
