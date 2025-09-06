"use client";

import * as Sentry from "@sentry/nextjs";

/** env (use bracket access for TS4111) */
const dsn =
  process.env["NEXT_PUBLIC_SENTRY_DSN"] ||
  process.env["SENTRY_DSN"] ||
  "";

const environment =
  process.env["SENTRY_ENV"] ||
  process.env["NODE_ENV"] ||
  "development";

const releaseMaybe =
  process.env["NEXT_PUBLIC_COMMIT_SHA"] ||
  process.env["VERCEL_GIT_COMMIT_SHA"] ||
  undefined;

if (dsn) {
  // Collect optional integrations; keep as unknown[] and merge via function form
  const extraIntegrations: unknown[] = [];

  const maybeTracing = (Sentry as any).browserTracingIntegration;
  if (typeof maybeTracing === "function") {
    extraIntegrations.push(maybeTracing());
  }

  const maybeReplay = (Sentry as any).replayIntegration;
  if (typeof maybeReplay === "function") {
    extraIntegrations.push(
      maybeReplay({
        maskAllInputs: true,
        blockAllMedia: true,
      })
    );
  }

  const options: Sentry.BrowserOptions = {
    dsn,
    environment,
    tunnel: "/monitoring",

    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Use function form to avoid array typing headaches
    integrations(defaults) {
      return [...defaults, ...(extraIntegrations as any[])];
    },

    // Correct signature; must return ErrorEvent|null
    beforeSend(event: Sentry.ErrorEvent, _hint: Sentry.EventHint): Sentry.ErrorEvent | null {
      try {
        const req: any = (event as any).request;
        const url = typeof req?.["url"] === "string" ? (req["url"] as string) : "";
        if (url.includes("/api/mpesa")) {
          delete (event as any).request; // omit instead of undefined (exactOptionalPropertyTypes)
        }
      } catch {
        /* no-op */
      }
      return event;
    },

    // Mutable array (not readonly) to satisfy Sentry types
    denyUrls: [
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      /extensions\//,
    ] as Array<string | RegExp>,
  };

  // Only set optional fields when defined
  if (releaseMaybe) options.release = releaseMaybe;

  Sentry.init(options);

  try {
    Sentry.setTag("runtime", "browser");
    if (releaseMaybe) Sentry.setTag("release", releaseMaybe);
  } catch {
    /* no-op */
  }
}

/** Safe shim for optional SDK helper */
export function onRouterTransitionStart(opts?: unknown) {
  const fn = (Sentry as unknown as {
    captureRouterTransitionStart?: (o?: unknown) => void;
  }).captureRouterTransitionStart;
  if (typeof fn === "function") fn(opts);
}

/** Optional console helpers in dev (or when explicitly enabled) */
const canExpose =
  process.env["NODE_ENV"] !== "production" ||
  process.env["NEXT_PUBLIC_SENTRY_DEBUG"] === "1";

if (canExpose) {
  try {
    (globalThis as any).Sentry = Sentry;
    (globalThis as any).__testSentry = (msg?: unknown) => {
      try {
        Sentry.captureMessage(String(msg ?? "qwiksale: test event"));
        console.info?.("[Sentry] test message sent");
        return true;
      } catch (e) {
        console.warn?.("[Sentry] failed to send", e);
        return false;
      }
    };
    console.info?.("[Sentry] Client instrumentation ready.");
  } catch {}
}
