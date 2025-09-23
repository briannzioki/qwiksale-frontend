// src/app/components/account/AvatarAutoRefresh.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/**
 * Listens for profile photo updates/removals and refreshes the current route
 * so server components (e.g., session, store pages) pick up the new avatar.
 */
export default function AvatarAutoRefresh({ debounceMs = 500 }: { debounceMs?: number }) {
  const router = useRouter();
  const [_, startTransition] = useTransition();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        startTransition(() => router.refresh());
      }, debounceMs);
    };

    const onUpdated = () => scheduleRefresh();
    const onRemoved = () => scheduleRefresh();

    window.addEventListener("qs:profile:photo:updated", onUpdated as EventListener);
    window.addEventListener("qs:profile:photo:removed", onRemoved as EventListener);

    return () => {
      window.removeEventListener("qs:profile:photo:updated", onUpdated as EventListener);
      window.removeEventListener("qs:profile:photo:removed", onRemoved as EventListener);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [debounceMs, router]);

  return null;
}
