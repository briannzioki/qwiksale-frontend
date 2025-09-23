// src/app/hooks/useOutsideClick.ts
"use client";

import { useEffect } from "react";

/**
 * Calls `onOutside` when a click/touch happens outside the given element.
 * Accepts refs where current may be null (typical React ref usage).
 */
export default function useOutsideClick<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  onOutside: () => void
) {
  useEffect(() => {
    function handler(e: MouseEvent | TouchEvent) {
      const el = ref.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (target && el.contains(target)) return;
      onOutside();
    }

    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });

    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [ref, onOutside]);
}
