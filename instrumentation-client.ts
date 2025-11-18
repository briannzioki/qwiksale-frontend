"use client";

import * as Sentry from "@sentry/browser";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || "";
const environment = process.env.SENTRY_ENV || process.env.NODE_ENV || "development";
const releaseMaybe =
  process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_COMMIT_SHA || undefined;
const useTunnel = process.env.NEXT_PUBLIC_SENTRY_TUNNEL !== "0";

const tracesSampleRate =
  Number.parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "") || 0.2;
const replaysSessionSampleRate =
  Number.parseFloat(process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE || "") || 0.0;
const replaysOnErrorSampleRate =
  Number.parseFloat(process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE || "") || 1.0;

if (dsn) {
  const extras: unknown[] = [];

  const tracing = (Sentry as any).browserTracingIntegration;
  if (typeof tracing === "function") extras.push(tracing());

  const replay = (Sentry as any).replayIntegration;
  if (typeof replay === "function") {
    extras.push(
      replay({
        maskAllInputs: true,
        blockAllMedia: true,
      }),
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
    tracesSampleRate,
    replaysSessionSampleRate,
    replaysOnErrorSampleRate,
    debug: process.env.NEXT_PUBLIC_SENTRY_DEBUG === "1",
    ...( { telemetry: false } as any ),
    integrations(defaults: any[]) {
      return [...defaults, ...(extras as any[])];
    },
    beforeSend(event: any) {
      try {
        const url = event?.request?.url;
        if (typeof url === "string" && url.includes("/api/mpesa")) {
          delete event.request;
        }
      } catch {}
      return event;
    },
    denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /extensions\//],
  });

  try {
    Sentry.setTag("runtime", "browser");
    if (releaseMaybe) Sentry.setTag("release", releaseMaybe);
  } catch {}
}

/** Kept for compatibility; intentionally a no-op now. */
export const onRouterTransitionStart = () => {};
