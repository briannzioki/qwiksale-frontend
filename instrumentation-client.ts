"use client";

import * as Sentry from "@sentry/nextjs";

// Re-export for Next router hook users (optional)
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

/**
 * --- ENV ---
 * Prefer NEXT_PUBLIC_SENTRY_DSN at runtime. SENTRY_DSN also works.
 * release: VERCEL_GIT_COMMIT_SHA (falls back to NEXT_PUBLIC_COMMIT_SHA)
 * environment: SENTRY_ENV (else NODE_ENV)
 * traces/replay sampling can be tuned via envs (see below).
 */
const dsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN ||
  process.env.SENTRY_DSN ||
  "";

const environment = process.env.SENTRY_ENV || process.env.NODE_ENV || "development";
const releaseMaybe = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_COMMIT_SHA || undefined;

// If you actually have a tunnel route at /api/monitoring, keep this true.
// If not, set NEXT_PUBLIC_SENTRY_TUNNEL="0" or remove the `tunnel` field below.
const useTunnel = process.env.NEXT_PUBLIC_SENTRY_TUNNEL !== "0";

// Sampling (can be overridden in Vercel env)
const tracesSampleRate =
  Number.parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "") || 0.2;
const replaysSessionSampleRate =
  Number.parseFloat(process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE || "") || 0.0;
const replaysOnErrorSampleRate =
  Number.parseFloat(process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE || "") || 1.0;

if (dsn) {
  // Integrations (some names differ across SDK minor versions; guard them)
  const extras: unknown[] = [];

  const tracing = (Sentry as any).browserTracingIntegration;
  if (typeof tracing === "function") extras.push(tracing());

  const replay = (Sentry as any).replayIntegration;
  if (typeof replay === "function") {
    extras.push(
      replay({
        maskAllInputs: true,
        blockAllMedia: true,
      })
    );
  }

  const captureConsole = (Sentry as any).captureConsoleIntegration;
  if (typeof captureConsole === "function") {
    extras.push(captureConsole({ levels: ["error", "warn"] }));
  }

  Sentry.init({
    dsn,
    environment,
    release: releaseMaybe,
    ...(useTunnel ? { tunnel: "/api/monitoring" } : {}),

    // Perf + Replay sampling
    tracesSampleRate,
    replaysSessionSampleRate,
    replaysOnErrorSampleRate,

    debug: process.env.NEXT_PUBLIC_SENTRY_DEBUG === "1",

    // Turn off SDK telemetry
    ...( { telemetry: false } as any ),

    integrations(defaults) {
      return [...defaults, ...(extras as any[])];
    },

    beforeSend(event: any) {
      try {
        const url = event?.request?.url;
        if (typeof url === "string" && url.includes("/api/mpesa")) {
          delete event.request; // scrub
        }
      } catch {}
      return event;
    },

    // Cut noise from extensions & dev tools
    denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /extensions\//],
  });

  try {
    Sentry.setTag("runtime", "browser");
    if (releaseMaybe) Sentry.setTag("release", releaseMaybe);
  } catch {}
}
