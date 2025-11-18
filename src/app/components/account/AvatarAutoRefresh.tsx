"use client";
// src/app/components/account/AvatarAutoRefresh.tsx

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/**
 * Listens for profile photo updates/removals and (optionally) refreshes the route
 * so server components (e.g., session, store pages) pick up the new avatar.
 *
 * - Never refreshes on mount.
 * - In tests/dev (webdriver or NEXT_PUBLIC_E2E=1), refresh is disabled to avoid soft-nav.
 * - In production, refreshes only in response to explicit "photo updated/removed" events.
 * - Ignores any such events during a short post-hydration grace window to avoid startup flakiness.
 */
export default function AvatarAutoRefresh({
  debounceMs = 500,
  graceMs = 1000,
}: {
  debounceMs?: number;
  /** Ignore events that fire within this many ms after mount (defaults to 1s). */
  graceMs?: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const timerRef = useRef<number | null>(null);
  const mountedAtRef = useRef<number>(Date.now());

  // Decide if refresh behavior should be active in this runtime.
  // Disable in e2e (webdriver) and when explicitly flagged; allow only in production.
  const SHOULD_REFRESH =
    process.env.NODE_ENV === "production" &&
    typeof navigator !== "undefined" &&
    !(navigator as any).webdriver &&
    process.env["NEXT_PUBLIC_E2E"] !== "1";

  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, []);

    const scheduleRefresh = () => {
      if (!SHOULD_REFRESH) return; // gate for dev/e2e
      // Post-hydration grace period to swallow any startup echo events
      if (Date.now() - mountedAtRef.current < graceMs) return;

      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        startTransition(() => router.refresh());
      }, debounceMs) as unknown as number;
    };

  useEffect(() => {
    // Only attach listeners client-side
    const onUpdated = () => scheduleRefresh();
    const onRemoved = () => scheduleRefresh();

    window.addEventListener("qs:profile:photo:updated", onUpdated as EventListener);
    window.addEventListener("qs:profile:photo:removed", onRemoved as EventListener);

    return () => {
      window.removeEventListener("qs:profile:photo:updated", onUpdated as EventListener);
      window.removeEventListener("qs:profile:photo:removed", onRemoved as EventListener);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // Safe deps: we only need to react if gating or timings change
  }, [SHOULD_REFRESH, debounceMs, graceMs]);

  return null;
}
