"use client";

import { useEffect, useRef } from "react";

type Options = {
  /** Extra control flags (all optional) */
  once?: boolean; // auto-unobserve after first intersect
  enabled?: boolean; // allow toggling without unmounting
  root?: Element | Document | null;
  rootMargin?: string;
  threshold?: number | number[];
};

/**
 * Small, dependency-free IntersectionObserver hook.
 * - Safe on SSR (no-op until the client).
 * - Debounces creation to when a ref element exists.
 * - Can auto-unobserve after first intersect (once=true).
 *
 * Usage:
 *   const sentRef = useIntersection(() => doLoadMore(), { rootMargin: "400px", once: false });
 *   return <div ref={sentRef} />;
 */
export default function useIntersection<T extends Element = HTMLDivElement>(
  cb: () => void,
  opts: Options | string = { rootMargin: "200px" }
) {
  // Back-compat: allow passing rootMargin as string second arg
  const merged: Options =
    typeof opts === "string" ? { rootMargin: opts } : { rootMargin: "200px", ...opts };

  const ref = useRef<T | null>(null);

  useEffect(() => {
    // SSR / disabled / no element / no IO support
    if (typeof window === "undefined") return;
    if (!merged.enabled && merged.enabled !== undefined && !merged.enabled) return;
    if (!ref.current) return;
    if (typeof (window as any).IntersectionObserver !== "function") {
      // If IO isn't available (very old browsers), just invoke once.
      try {
        cb();
      } catch {
        /* noop */
      }
      return;
    }

    const el = ref.current;

    let stopped = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (stopped) return;
        const entry = entries[0];
        if (entry?.isIntersecting) {
          cb();
          if (merged.once) {
            try {
              observer.unobserve(el);
            } catch {
              /* noop */
            }
            stopped = true;
          }
        }
      },
      {
        root: (merged.root as Element | null) ?? null,
        rootMargin: merged.rootMargin ?? "200px",
        threshold: merged.threshold ?? 0,
      }
    );

    observer.observe(el);

    return () => {
      try {
        observer.unobserve(el);
        observer.disconnect();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cb,
    merged.enabled,
    merged.root,
    merged.rootMargin,
    // JSON stringify avoids array identity churn for thresholds
    Array.isArray(merged.threshold) ? JSON.stringify(merged.threshold) : merged.threshold,
    merged.once,
  ]);

  return ref;
}
