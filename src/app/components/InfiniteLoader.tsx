// src/app/components/InfiniteLoader.tsx
"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** Callback fired when the sentinel becomes visible */
  onLoadAction: () => void;
  disabled?: boolean;
};

export default function InfiniteLoader({ onLoadAction, disabled = false }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const tickingRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const cbRef = useRef(onLoadAction);

  // keep latest callback without re-subscribing the observer
  useEffect(() => {
    cbRef.current = onLoadAction;
  }, [onLoadAction]);

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    // Reset any previous observer
    if (ioRef.current) ioRef.current.disconnect();

    ioRef.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !tickingRef.current) {
            // leading-edge throttle to avoid rapid re-fires
            tickingRef.current = true;
            cbRef.current?.();
            // tiny debounce to let the list append & layout settle
            timeoutRef.current = window.setTimeout(() => {
              tickingRef.current = false;
              if (timeoutRef.current) {
                window.clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
              }
            }, 150);
            break;
          }
        }
      },
      { rootMargin: "600px 0px" }
    );

    ioRef.current.observe(el);

    return () => {
      ioRef.current?.disconnect();
      ioRef.current = null;
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      tickingRef.current = false;
    };
  }, [disabled]);

  return <div ref={ref} aria-hidden={true} className="h-12" />;
}
