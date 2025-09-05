// src/instrumentation-client.ts
"use client";

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || "";
const environment = process.env.SENTRY_ENV || process.env.NODE_ENV || "development";

Sentry.init({
  dsn,
  environment,
  tunnel: "/monitoring", // must match next.config.js rewrite
  tracesSampleRate: 0.2,          // front-end performance
  replaysSessionSampleRate: 0.1,  // 10% sessions
  replaysOnErrorSampleRate: 1.0,  // 100% when error occurs
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({ maskAllInputs: true, blockAllMedia: true }),
  ],
  beforeSend(event) {
    try {
      if (event.request?.url?.includes("/api/mpesa")) {
        // Drop request context for sensitive endpoints
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        delete event.request;
      }
    } catch {}
    return event;
  },
  denyUrls: [/^chrome-extension:\/\//, /extensions\//, /^moz-extension:\/\//],
});

// Required by Sentry to instrument navigations in Next 15+
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

/**
 * Expose Sentry on window/globalThis for console testing:
 * - Always in development (`npm run dev`)
 * - In production ONLY if NEXT_PUBLIC_SENTRY_DEBUG=1 is set
 */
if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SENTRY_DEBUG === "1") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Sentry = Sentry;
  if (typeof console !== "undefined" && console.info) {
    console.info("[Sentry] Exposed on window/globalThis for console testing.");
  }
}
