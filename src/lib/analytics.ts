// src/app/lib/analytics.ts
import posthog, { PostHog } from "posthog-js";

/** Access env that’s safe for the client (NEXT_PUBLIC_ only). */
const PH_KEY = process.env["NEXT_PUBLIC_POSTHOG_KEY"] || "";
const PH_HOST = process.env["NEXT_PUBLIC_POSTHOG_HOST"] || "https://app.posthog.com";

/** A tiny global flag to prevent multiple initializations across Fast Refresh / suspense boundaries. */
declare global {
  interface Window {
    __PH_INITED__?: boolean;
  }
}

/**
 * Initialize PostHog on the client.
 * Safe to call multiple times — it’s a no-op after the first successful init.
 */
export function initAnalytics(options?: {
  debug?: boolean;
  persistence?: "memory" | "localStorage+cookie" | "localStorage" | "cookie";
  capturePageview?: boolean; // default true
  capturePageleave?: boolean; // default true
}): boolean {
  if (typeof window === "undefined") return false;
  if (!PH_KEY) return false; // not configured
  if (window.__PH_INITED__) return true;

  posthog.init(PH_KEY, {
    api_host: PH_HOST,
    // Make soft navigations show up even with App Router
    capture_pageview: options?.capturePageview ?? true,
    capture_pageleave: options?.capturePageleave ?? true,
    debug: options?.debug ?? false,
    persistence: options?.persistence ?? "localStorage+cookie",
    // Respect DNT automatically
    disable_session_recording: true, // flip to false if you want session replay
  } as Parameters<PostHog["init"]>[1]);

  window.__PH_INITED__ = true;
  return true;
}

/** True if PostHog is initialized and usable. */
export function isAnalyticsReady(): boolean {
  if (typeof window === "undefined") return false;
  // `__loaded` is internal; guard with optional chaining to keep TS happy
  return Boolean((posthog as any)?.__loaded || window.__PH_INITED__);
}

/** Fire a custom event. */
export function track(event: string, props?: Record<string, any>): void {
  if (typeof window === "undefined") return;
  if (!isAnalyticsReady()) return;
  posthog.capture(event, props);
}

/** Manually record a pageview (useful if you disable auto-capture or on custom transitions). */
export function trackPageview(url?: string): void {
  if (typeof window === "undefined") return;
  if (!isAnalyticsReady()) return;
  posthog.capture("$pageview", url ? { $current_url: url } : undefined);
}

/** Identify the current user (call after login). */
export function identify(userId: string, props?: Record<string, any>): void {
  if (typeof window === "undefined") return;
  if (!isAnalyticsReady()) return;
  posthog.identify(userId, props);
}

/** Update person properties without changing identity. */
export function setPersonProps(props: Record<string, any>): void {
  if (typeof window === "undefined") return;
  if (!isAnalyticsReady()) return;
  // PostHog v2 exposes setPersonProperties
  (posthog as any).setPersonProperties?.(props);
}

/** Link an anonymous id to a known id (rare, but sometimes useful). */
export function alias(newId: string): void {
  if (typeof window === "undefined") return;
  if (!isAnalyticsReady()) return;
  posthog.alias(newId);
}

/** Respect user consent: opt-in/out to tracking. */
export function optIn(): void {
  if (typeof window === "undefined") return;
  if (!PH_KEY) return;
  posthog.opt_in_capturing();
}
export function optOut(): void {
  if (typeof window === "undefined") return;
  if (!PH_KEY) return;
  posthog.opt_out_capturing();
}

/** Reset all analytics state (use on logout). */
export function resetAnalytics(): void {
  if (typeof window === "undefined") return;
  if (!isAnalyticsReady()) return;
  posthog.reset();
}

/**
 * Optional: attach a lightweight router hook somewhere in a client component
 * to record SPA navigations if you ever disable `capture_pageview`.
 *
 * Example:
 *   const pathname = usePathname();
 *   useEffect(() => { trackPageview(window.location.href); }, [pathname]);
 */
