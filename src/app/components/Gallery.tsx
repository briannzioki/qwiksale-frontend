// src/app/components/Gallery.tsx
"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import SmartImage from "@/app/components/SmartImage";

type Props = {
  images: string[];
  initialIndex?: number;
  className?: string;
  onCloseAction?: () => void;
  /** When false, Gallery will NOT render its own fullscreen opener and will NOT open a lightbox. */
  lightbox?: boolean;
};

export default function Gallery({
  images,
  initialIndex = 0,
  className = "",
  onCloseAction,
  lightbox = true,
}: Props) {
  const safeImages = useMemo(() => (Array.isArray(images) ? images.filter(Boolean) : []), [images]);

  const [idx, setIdx] = useState(
    Math.min(Math.max(0, initialIndex), Math.max(0, safeImages.length - 1))
  );
  const [open, setOpen] = useState<boolean>(false);
  const uid = useId();
  const dialogId = `gallery-${uid}`;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const thumbsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const [suppressInlineOpener, setSuppressInlineOpener] = useState<boolean>(!lightbox);

  const hasPrev = idx > 0;
  const hasNext = idx < safeImages.length - 1;

  const openLightbox = (at = idx) => {
    setIdx(at);
    if (lightbox) setOpen(true);
  };

  const closeLightbox = () => {
    setOpen(false);
    onCloseAction?.();
  };

  const goPrev = useCallback(() => {
    if (!hasPrev) return;
    setIdx((i) => Math.max(0, i - 1));
  }, [hasPrev]);

  const goNext = useCallback(() => {
    if (!hasNext) return;
    setIdx((i) => Math.min(safeImages.length - 1, i + 1));
  }, [hasNext, safeImages.length]);

  useEffect(() => {
    const len = safeImages.length;
    if (len === 0) return;
    const desired = Math.min(Math.max(0, initialIndex), len - 1);
    setIdx((cur) => {
      const clampedCur = Math.min(Math.max(0, cur), len - 1);
      return Number.isFinite(cur as number) ? clampedCur : desired;
    });
  }, [safeImages, initialIndex]);

  useEffect(() => {
    thumbsRef.current = [];
  }, [safeImages]);

  // Keyboard: arrows + Escape to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goPrev, goNext, closeLightbox]);

  // Basic focus trap when open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        (last as HTMLElement).focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        (first as HTMLElement).focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => closeBtnRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    if (!lightbox) return;
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open, lightbox]);

  // --- Robust de-duplication of openers + external overlay wiring ---
  const overlayRef = useRef<HTMLElement | null>(null);
  const overlayHandlerRef = useRef<(e: Event) => void>(() => {});
  const openRef = useRef<() => void>(() => {});
  useEffect(() => {
    // keep the latest open action
    openRef.current = () => openLightbox();
  });

  useEffect(() => {
    if (!lightbox) {
      setSuppressInlineOpener(true);
      // cleanup any prior overlay listener
      if (overlayRef.current && overlayHandlerRef.current) {
        overlayRef.current.removeEventListener("click", overlayHandlerRef.current, true);
      }
      overlayRef.current = null;
      return;
    }
    const node = rootRef.current;
    if (!node) return;

    const getWrap = (): HTMLElement => {
      const wrap =
        (node.closest("[data-gallery-wrap]") as HTMLElement | null) ??
        node.parentElement ??
        document.body;
      return wrap;
    };

    const refresh = () => {
      const wrap = getWrap();

      const externalOverlay = wrap.querySelector<HTMLElement>("[data-gallery-overlay]");
      const anotherOpener = wrap.querySelector<HTMLButtonElement>(
        'button[aria-label="Open image in fullscreen"]:not([data-gallery-internal])'
      );

      const shouldSuppress = !!(externalOverlay || anotherOpener);
      setSuppressInlineOpener(shouldSuppress);

      // Manage overlay listener: attach only if an external overlay exists.
      // Detach from any previous overlay if it changed.
      if (overlayRef.current && overlayRef.current !== externalOverlay && overlayHandlerRef.current) {
        overlayRef.current.removeEventListener("click", overlayHandlerRef.current, true);
        overlayRef.current = null;
      }

      if (externalOverlay && overlayRef.current !== externalOverlay) {
        overlayRef.current = externalOverlay;
        const handler = (e: Event) => {
          // Don't fight any page-level forwarders; just ensure our lightbox opens.
          // Avoid calling with an index; open at current idx.
          openRef.current();
        };
        overlayHandlerRef.current = handler;
        externalOverlay.addEventListener("click", handler, true);
      }
    };

    // Initial run
    refresh();

    // Observe DOM changes around the wrap to re-run refresh if overlays/buttons are injected/removed
    const wrap = getWrap();
    const mo = new MutationObserver(() => refresh());
    mo.observe(wrap, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-label", "data-gallery-overlay"],
    });

    // Cleanup
    return () => {
      mo.disconnect();
      if (overlayRef.current && overlayHandlerRef.current) {
        overlayRef.current.removeEventListener("click", overlayHandlerRef.current, true);
      }
      overlayRef.current = null;
    };
  }, [lightbox]);

  if (!safeImages.length) {
    return (
      <div className="rounded-xl border p-4 text-sm text-gray-500 dark:border-slate-800 dark:text-slate-300">
        No images
      </div>
    );
  }

  return (
    <div ref={rootRef} className={["w-full", className].join(" ")}>
      {/* Inline main image */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
        <SmartImage
          src={safeImages[idx]}
          alt={`Image ${idx + 1} of ${safeImages.length}`}
          fill
          sizes="(max-width: 768px) 100vw, 800px"
          className="object-cover pointer-events-none"
          priority={false}
        />

        {/* Only render our own opener when lightbox is enabled AND no external overlay exists */}
        {lightbox && !suppressInlineOpener && (
          <button
            type="button"
            className="absolute inset-0 z-[60]"
            onClick={() => openLightbox(idx)}
            aria-label="Open image in fullscreen"
            aria-haspopup="dialog"
            aria-controls={dialogId}
            data-gallery-internal
          />
        )}
      </div>

      {/* Thumbnails */}
      <div className="mt-2 grid grid-cols-5 gap-2 md:grid-cols-8">
        {safeImages.map((src, i) => (
          <button
            key={`${src}:${i}`}
            ref={(el) => {
              thumbsRef.current[i] = el;
            }}
            type="button"
            className={`relative aspect-square overflow-hidden rounded-lg border ${
              i === idx ? "ring-2 ring-[#39a0ca]" : "border-slate-200 dark:border-slate-700"
            }`}
            aria-label={`Show image ${i + 1}`}
            aria-current={i === idx ? "true" : undefined}
            onClick={() => setIdx(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                thumbsRef.current[Math.max(0, i - 1)]?.focus();
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                thumbsRef.current[Math.min(safeImages.length - 1, i + 1)]?.focus();
              } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setIdx(i);
                if (lightbox) openLightbox(i);
              }
            }}
          >
            <SmartImage src={src} alt={`Thumbnail ${i + 1}`} fill className="object-cover" />
          </button>
        ))}
      </div>

      {/* Lightbox dialog */}
      {lightbox && open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/60"
            aria-label="Close gallery"
            onClick={closeLightbox}
          />
          <div
            id={dialogId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${dialogId}-title`}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          >
            <div
              ref={panelRef}
              className="relative w-full max-w-5xl overflow-hidden rounded-2xl border bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 id={`${dialogId}-title`} className="text-sm font-semibold">
                  Image {idx + 1} / {safeImages.length}
                </h2>
                <button
                  ref={closeBtnRef}
                  type="button"
                  className="rounded-md border px-2 py-1 text-sm hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-900"
                  onClick={closeLightbox}
                >
                  Close
                </button>
              </div>

              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                <SmartImage
                  src={safeImages[idx]}
                  alt={`Image ${idx + 1} of ${safeImages.length}`}
                  fill
                  sizes="100vw"
                  className="object-contain pointer-events-none"
                />
                {/* Prev/Next */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-between">
                  <button
                    type="button"
                    className="pointer-events-auto ml-2 rounded-full bg-white/80 px-2 py-1 text-sm backdrop-blur hover:bg-white dark:bg-slate-900/70"
                    disabled={!hasPrev}
                    onClick={goPrev}
                    aria-label="Previous image"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="pointer-events-auto mr-2 rounded-full bg-white/80 px-2 py-1 text-sm backdrop-blur hover:bg-white dark:bg-slate-900/70"
                    disabled={!hasNext}
                    onClick={goNext}
                    aria-label="Next image"
                  >
                    →
                  </button>
                </div>
              </div>

              {/* Thumbs inside lightbox */}
              <div className="mt-2 grid grid-cols-6 gap-2 md:grid-cols-10">
                {safeImages.map((src, i) => (
                  <button
                    key={`lb:${src}:${i}`}
                    type="button"
                    className={`relative aspect-square overflow-hidden rounded-lg border ${
                      i === idx ? "ring-2 ring-[#39a0ca]" : "border-slate-200 dark:border-slate-700"
                    }`}
                    aria-label={`Show image ${i + 1}`}
                    aria-current={i === idx ? "true" : undefined}
                    onClick={() => setIdx(i)}
                  >
                    <SmartImage src={src} alt={`Thumbnail ${i + 1}`} fill className="object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
