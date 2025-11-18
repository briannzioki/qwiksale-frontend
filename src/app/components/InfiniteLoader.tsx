"use client";
// src/app/components/InfiniteLoader.tsx

import { useEffect, useRef } from "react";

type Props = {
  /** Fired when the sentinel becomes (pre)visible. Can be async. */
  onLoadAction: () => void | Promise<void>;
  /** Disable observing (e.g., while loading or when no more pages). */
  disabled?: boolean;
  /** IntersectionObserver options (sane defaults below). */
  rootMargin?: string;
  threshold?: number | number[];
  /** If true, fires once then disconnects. */
  once?: boolean;
  /** Optional className for sizing/spacing the sentinel (invisible but occupies space). */
  className?: string;

  /** --- Optional retry affordance --- */
  /** If provided, a visible Retry button can be rendered. (Name ends with “Action” to satisfy Next’s rule.) */
  onRetryAction?: () => void | Promise<void>;
  /** Toggle visibility of the retry button (pair with `onRetryAction`). */
  showRetry?: boolean;
  /** Customize the retry label. */
  retryLabel?: string;
  /** Class for the retry container (spacing above/below). */
  retryClassName?: string;
};

export default function InfiniteLoader({
  onLoadAction,
  disabled = false,
  rootMargin = "600px 0px",
  threshold = 0,
  once = false,
  className = "h-12",
  onRetryAction,
  showRetry = false,
  retryLabel = "Retry",
  retryClassName = "mt-3",
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);

  // Prevent re-entrancy while we're handling a load
  const busyRef = useRef(false);

  // Keep the latest callback without re-subscribing the observer
  const cbRef = useRef(onLoadAction);
  useEffect(() => {
    cbRef.current = onLoadAction;
  }, [onLoadAction]);

  // Any pending timeout used for throttle/settling
  const timeoutRef = useRef<number | null>(null);

  // Helper to release busy flag after layout settles
  const releaseBusy = () => {
    // Two RAFs lets the DOM update and paint once (common pattern)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        busyRef.current = false;
      });
    });
  };

  useEffect(() => {
    const el = ref.current;

    // Clean up any previous observer
    if (ioRef.current) {
      ioRef.current.disconnect();
      ioRef.current = null;
    }
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    busyRef.current = false;

    if (!el || disabled) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (busyRef.current) return;

          busyRef.current = true;

          try {
            const res = cbRef.current?.();

            // If the callback is async, only release when it settles;
            // otherwise apply a tiny throttle to allow list append + layout.
            if (res && typeof (res as Promise<void>).then === "function") {
              (res as Promise<void>)
                .catch(() => {
                  /* swallow callback errors here; caller handles UI */
                })
                .finally(() => {
                  if (once) {
                    io.disconnect();
                  }
                  releaseBusy();
                });
            } else {
              if (once) {
                io.disconnect();
              }
              timeoutRef.current = window.setTimeout(() => {
                timeoutRef.current && window.clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
                releaseBusy();
              }, 150);
            }
          } catch {
            // If the callback throws synchronously, release the lock so we can retry later
            releaseBusy();
          }

          break; // only need one matching entry
        }
      },
      { rootMargin, threshold }
    );

    io.observe(el);
    ioRef.current = io;

    return () => {
      io.disconnect();
      ioRef.current = null;
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      busyRef.current = false;
    };
  }, [disabled, rootMargin, threshold, once]);

  return (
    <>
      {/* Invisible IO sentinel (space holder) */}
      <div ref={ref} aria-hidden role="presentation" className={className} />

      {/* Optional retry affordance (consumer controls visibility via `showRetry`) */}
      {onRetryAction && showRetry ? (
        <div className={retryClassName}>
          <button
            type="button"
            onClick={() => void onRetryAction()}
            className="btn-outline"
            aria-label="Retry loading more results"
          >
            {retryLabel}
          </button>
        </div>
      ) : null}
    </>
  );
}
