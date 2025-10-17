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
  const extraIntegrations: unknown[] = [];

  const maybeTracing = (Sentry as any).browserTracingIntegration;
  if (typeof maybeTracing === "function") extraIntegrations.push(maybeTracing());

  // Only used if available (you opted out in the wizard, so this will be skipped)
  const maybeReplay = (Sentry as any).replayIntegration;
  if (typeof maybeReplay === "function") {
    extraIntegrations.push(
      maybeReplay({ maskAllInputs: true, blockAllMedia: true })
    );
  }

  const options: Sentry.BrowserOptions = {
    dsn,
    environment,
    // Route all browser events through our API tunnel
    tunnel: "/api/monitoring",

    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,

    integrations(defaults) {
      return [...defaults, ...(extraIntegrations as any[])];
    },

    beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
      try {
        const req: any = (event as any).request;
        const url = typeof req?.url === "string" ? req.url : "";
        if (url.includes("/api/mpesa")) delete (event as any).request;
      } catch {}
      return event;
    },

    denyUrls: [
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      /extensions\//,
    ] as Array<string | RegExp>,
  };

  if (releaseMaybe) options.release = releaseMaybe;

  Sentry.init(options);

  try {
    Sentry.setTag("runtime", "browser");
    if (releaseMaybe) Sentry.setTag("release", releaseMaybe);
  } catch {}
}

/** Safe shim for optional SDK helper */
export function onRouterTransitionStart(opts?: unknown) {
  const fn = (Sentry as any)?.captureRouterTransitionStart as
    | ((o?: unknown) => void)
    | undefined;
  if (typeof fn === "function") fn(opts);
}

if (
  process.env["NODE_ENV"] !== "production" ||
  process.env["NEXT_PUBLIC_SENTRY_DEBUG"] === "1"
) {
  try {
    (globalThis as any).Sentry = Sentry;
    (globalThis as any).__testSentry = (msg?: unknown) => {
      try {
        Sentry.captureMessage(String(msg ?? "qwiksale: test event"));
        console.info?.("[Sentry] Client instrumentation ready — test message sent.");
        return true;
      } catch (e) {
        console.warn?.("[Sentry] failed to send", e);
        return false;
      }
    };
    console.info?.("[Sentry] Client instrumentation ready.");
  } catch {}
}
