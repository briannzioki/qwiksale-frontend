// src/instrumentation.ts
import * as Sentry from "@sentry/nextjs";

/**
 * Next.js will call `register()` on the server runtime (Node or Edge).
 * Keep this file in `src/` so it runs for both app router & route handlers.
 */
export async function register() {
  const dsn = process.env["SENTRY_DSN"] || process.env["NEXT_PUBLIC_SENTRY_DSN"] || "";
  if (!dsn) return;

  const environment = process.env["SENTRY_ENV"] || process.env.NODE_ENV || "development";
  const releaseMaybe =
    process.env["VERCEL_GIT_COMMIT_SHA"] || process.env["NEXT_PUBLIC_COMMIT_SHA"] || undefined;

  const useTunnel = process.env["SENTRY_TUNNEL"] !== "0" && process.env["NEXT_PUBLIC_SENTRY_TUNNEL"] !== "0";

  // Perf sampling (server side)
  const tracesSampleRate =
    Number.parseFloat(process.env["SENTRY_TRACES_SAMPLE_RATE"] || "") || 0.2;

  const extras: unknown[] = [];
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
    debug: process.env["SENTRY_DEBUG"] === "1" || process.env["NEXT_PUBLIC_SENTRY_DEBUG"] === "1",

    // Turn off SDK telemetry
    ...( { telemetry: false } as any ),

    integrations(defaults) {
      return [...defaults, ...(extras as any[])];
    },

    beforeSend(event: any) {
      try {
        const url = (event as any)?.request?.url;
        if (typeof url === "string" && url.includes("/api/mpesa")) {
          delete (event as any).request;
        }
      } catch {}
      return event;
    },
  });

  try {
    const isEdge =
      process.env["NEXT_RUNTIME"] === "edge" ||
      typeof (globalThis as any).EdgeRuntime === "string";

    Sentry.setTag("runtime", isEdge ? "edge" : "node");
    Sentry.setTag("node_env", environment);
    if (releaseMaybe) Sentry.setTag("release", releaseMaybe);
  } catch {}
}

/**
 * Optional: richer capture helpers for Next's error hooks.
 * You can call these from error handlers (e.g., middleware/route) if needed.
 */
export function onRequestError(...args: unknown[]) {
  const [error, reqMaybe] = args as [unknown, Request | undefined];
  const cre = (Sentry as any)?.captureRequestError as
    | ((e: unknown, req?: Request) => void)
    | undefined;

  if (typeof cre === "function") {
    try {
      reqMaybe ? cre(error, reqMaybe) : cre(error);
      return;
    } catch {}
  }

  try {
    Sentry.captureException(error, (scope) => {
      scope.setTag("runtime", process.env["NEXT_RUNTIME"] || "nodejs");
      if (reqMaybe) {
        try {
          scope.setContext("request", { url: reqMaybe.url, method: reqMaybe.method });
        } catch {}
      }
      return scope;
    });
  } catch {}
}

export function onUnhandledError(error: unknown) {
  try {
    Sentry.captureException(error, (scope) => {
      scope.setTag("runtime", process.env["NEXT_RUNTIME"] || "nodejs");
      scope.setLevel("error");
      return scope;
    });
  } catch {}
}

// Dev helper (handy in Preview/Dev)
if (process.env.NODE_ENV !== "production" || process.env["NEXT_PUBLIC_SENTRY_DEBUG"] === "1") {
  try {
    (globalThis as any).__testSentryServer = (msg?: unknown) => {
      try {
        Sentry.captureMessage(String(msg ?? "qwiksale: server test event"));
        return true;
      } catch {
        return false;
      }
    };
  } catch {}
}
