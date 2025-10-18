"use client";
import * as Sentry from "@sentry/nextjs";

// ✅ Required by Next 15/Sentry to instrument navigations
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

const dsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN ||
  process.env.SENTRY_DSN ||
  "";

const environment = process.env.SENTRY_ENV || process.env.NODE_ENV || "development";
const releaseMaybe = process.env.NEXT_PUBLIC_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || undefined;

if (dsn) {
  const extra: unknown[] = [];

  const tracing = (Sentry as any).browserTracingIntegration;
  if (typeof tracing === "function") extra.push(tracing());

  const replay = (Sentry as any).replayIntegration;
  if (typeof replay === "function") {
    extra.push(replay({ maskAllInputs: true, blockAllMedia: true }));
  }

  const captureConsole = (Sentry as any).captureConsoleIntegration;
  if (typeof captureConsole === "function") {
    extra.push(captureConsole({ levels: ["error", "warn"] }));
  }

  Sentry.init({
    dsn,
    environment,
    release: releaseMaybe,
    tunnel: "/api/monitoring",

    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,

    debug: process.env.NEXT_PUBLIC_SENTRY_DEBUG === "1",

    // TS-safe way to turn off SDK telemetry
    ...( { telemetry: false } as any ),

    integrations(defaults) {
      return [...defaults, ...(extra as any[])];
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
