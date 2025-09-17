// src/app/components/Gallery.tsx
"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import SmartImage from "@/app/components/SmartImage";

type Props = {
  images: string[];                // array of Cloudinary IDs or absolute URLs
  initialIndex?: number;           // default 0
  className?: string;
  onCloseAction?: () => void;      // renamed for client component prop-serializability rule
  /** If true, renders a fullscreen lightbox dialog overlay; if false, inline gallery only */
  lightbox?: boolean;
};

export default function Gallery({
  images,
  initialIndex = 0,
  className = "",
  onCloseAction,
  lightbox = true,
}: Props) {
  const safeImages = useMemo(
    () => (Array.isArray(images) ? images.filter(Boolean) : []),
    [images]
  );

  const [idx, setIdx] = useState(
    Math.min(Math.max(0, initialIndex), Math.max(0, safeImages.length - 1))
  );
  const [open, setOpen] = useState<boolean>(false);
  const dialogId = `gallery-${useId()}`;

  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const thumbsRef = useRef<Array<HTMLButtonElement | null>>([]);

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

  // ✅ Clamp idx if images/initialIndex change (prevents out-of-bounds)
  useEffect(() => {
    const len = safeImages.length;
    if (len === 0) return;
    const desired = Math.min(Math.max(0, initialIndex), len - 1);
    setIdx((cur) => {
      const clampedCur = Math.min(Math.max(0, cur), len - 1);
      // If cur was invalid (NaN/undefined), fall back to desired
      return Number.isFinite(cur as number) ? clampedCur : desired;
    });
  }, [safeImages, initialIndex]); // ← removed redundant safeImages.length

  // Keyboard support (←/→/Esc) when modal is open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goPrev, goNext]);

  // Focus trap when modal open
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

  // autofocus close button when opened
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => closeBtnRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  // ✅ Prevent background scroll when lightbox is open
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

  if (!safeImages.length) {
    return (
      <div className="rounded-xl border p-4 text-sm text-gray-500 dark:border-slate-800 dark:text-slate-300">
        No images
      </div>
    );
  }

  return (
    <div className={["w-full", className].join(" ")}>
      {/* Inline main image */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
        <button
          type="button"
          className="absolute inset-0"
          onClick={() => openLightbox(idx)}
          aria-label="Open image in fullscreen"
        />
        <SmartImage
          src={safeImages[idx]}
          alt={`Image ${idx + 1} of ${safeImages.length}`}
          fill
          sizes="(max-width: 768px) 100vw, 800px"
          className="object-cover"
          priority={false}
        />
      </div>

      {/* Thumbs */}
      <div className="mt-2 grid grid-cols-5 gap-2 md:grid-cols-8">
        {safeImages.map((src, i) => (
          <button
            key={`${src}:${i}`}
            ref={(el) => {
              thumbsRef.current[i] = el; // return void, fixes TS2322
            }}
            type="button"
            className={`relative aspect-square overflow-hidden rounded-lg border ${
              i === idx ? "ring-2 ring-brandBlue" : "border-slate-200 dark:border-slate-700"
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
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
                  className="object-contain"
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
                      i === idx ? "ring-2 ring-brandBlue" : "border-slate-200 dark:border-slate-700"
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
