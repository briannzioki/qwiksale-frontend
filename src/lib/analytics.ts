// src/app/lib/analytics.ts

/** Access env that’s safe for the client (NEXT_PUBLIC_ only). */
const PH_KEY = process.env["NEXT_PUBLIC_POSTHOG_KEY"] || "";
const PH_HOST = process.env["NEXT_PUBLIC_POSTHOG_HOST"] || "https://app.posthog.com";

/** A tiny global flag to prevent multiple initializations across Fast Refresh / suspense boundaries. */
declare global {
  interface Window {
    __PH_INITED__?: boolean;
    __PH_INSTANCE__?: any;
  }
}

/** Internal: ensure we have a posthog instance on window (browser only). */
function ensurePH() {
  if (typeof window === "undefined") return null;
  if (window.__PH_INSTANCE__) return window.__PH_INSTANCE__;
  return null;
}

/**
 * Initialize PostHog on the client.
 * Safe to call multiple times — it’s a no-op after the first successful init.
 *
 * NOTE: We avoid `import "posthog-js"` at the top level to prevent
 * "Cannot find module 'posthog-js'" TS errors in server builds.
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

  // Dynamically import only in the browser so TS/SSR never needs type defs.
  // We deliberately do not await to keep the API synchronous; follow-up calls will be no-ops until ready.
  void import("posthog-js")
    .then((mod: any) => {
      try {
        const posthog = mod?.default ?? mod;
        if (!posthog?.init) return;

        posthog.init(PH_KEY, {
          api_host: PH_HOST,
          capture_pageview: options?.capturePageview ?? true,
          capture_pageleave: options?.capturePageleave ?? true,
          debug: options?.debug ?? false,
          persistence: options?.persistence ?? "localStorage+cookie",
          disable_session_recording: true, // flip to false if you want session replay
        } as any);

        window.__PH_INSTANCE__ = posthog;
        window.__PH_INITED__ = true;
      } catch {
        // swallow init errors to avoid crashing the app
      }
    })
    .catch(() => {
      /* ignore dynamic import failures */
    });

  // We return true to indicate "init kicked off"; actual readiness can be checked via isAnalyticsReady().
  return true;
}

/** True if PostHog is initialized and usable. */
export function isAnalyticsReady(): boolean {
  if (typeof window === "undefined") return false;
  const ph = ensurePH();
  return Boolean(ph?.__loaded || window.__PH_INITED__);
}

/** Fire a custom event. */
export function track(event: string, props?: Record<string, any>): void {
  if (typeof window === "undefined") return;
  const ph = ensurePH();
  if (!ph) return;
  try {
    ph.capture(event, props);
  } catch {
    /* noop */
  }
}

/** Manually record a pageview (useful if you disable auto-capture or on custom transitions). */
export function trackPageview(url?: string): void {
  if (typeof window === "undefined") return;
  const ph = ensurePH();
  if (!ph) return;
  try {
    ph.capture("$pageview", url ? { $current_url: url } : undefined);
  } catch {
    /* noop */
  }
}

/** Identify the current user (call after login). */
export function identify(userId: string, props?: Record<string, any>): void {
  if (typeof window === "undefined") return;
  const ph = ensurePH();
  if (!ph) return;
  try {
    ph.identify(userId, props);
  } catch {
    /* noop */
  }
}

/** Update person properties without changing identity. */
export function setPersonProps(props: Record<string, any>): void {
  if (typeof window === "undefined") return;
  const ph = ensurePH();
  if (!ph) return;
  try {
    // PostHog v2 exposes setPersonProperties; older versions may not.
    ph.setPersonProperties?.(props);
  } catch {
    /* noop */
  }
}

/** Link an anonymous id to a known id (rare, but sometimes useful). */
export function alias(newId: string): void {
  if (typeof window === "undefined") return;
  const ph = ensurePH();
  if (!ph) return;
  try {
    ph.alias(newId);
  } catch {
    /* noop */
  }
}

/** Respect user consent: opt-in/out to tracking. */
export function optIn(): void {
  if (typeof window === "undefined") return;
  if (!PH_KEY) return;
  const ph = ensurePH();
  try {
    ph?.opt_in_capturing?.();
  } catch {
    /* noop */
  }
}
export function optOut(): void {
  if (typeof window === "undefined") return;
  if (!PH_KEY) return;
  const ph = ensurePH();
  try {
    ph?.opt_out_capturing?.();
  } catch {
    /* noop */
  }
}

/** Reset all analytics state (use on logout). */
export function resetAnalytics(): void {
  if (typeof window === "undefined") return;
  const ph = ensurePH();
  try {
    ph?.reset?.();
  } catch {
    /* noop */
  }
}

/**
 * Optional: attach a lightweight router hook somewhere in a client component
 * to record SPA navigations if you ever disable `capture_pageview`.
 *
 * Example:
 *   const pathname = usePathname();
 *   useEffect(() => { trackPageview(window.location.href); }, [pathname]);
 */
