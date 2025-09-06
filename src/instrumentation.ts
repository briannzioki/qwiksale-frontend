// src/instrumentation.ts
import * as Sentry from "@sentry/nextjs";

// Pull in your root server config (auto-inits Sentry per @sentry/nextjs docs).
// Keep this import at the top so init happens before any hooks are used.
import "../sentry.server.config";

/**
 * Optional: tag common metadata on boot.
 * Next calls register() once on the server during startup.
 */
export async function register() {
  try {
    const environment =
      process.env["SENTRY_ENV"] || process.env.NODE_ENV || "development";
    const release =
      process.env["NEXT_PUBLIC_COMMIT_SHA"] ||
      process.env["VERCEL_GIT_COMMIT_SHA"] ||
      undefined;

    Sentry.setTag("runtime", "server");
    Sentry.setTag("node_env", environment);
    if (release) Sentry.setTag("release", release);
  } catch {
    // no-op (keep this hook resilient)
  }
}

/**
 * Capture server request errors. On Sentry 8+ we can use captureRequestError,
 * otherwise we fall back to captureException and attach the URL/method.
 */
export function onRequestError(error: unknown, request: Request) {
  const maybeCapture = (Sentry as unknown as {
    captureRequestError?: (err: unknown, req: Request) => void;
  }).captureRequestError;

  if (typeof maybeCapture === "function") {
    // Sentry 8+ helper
    maybeCapture(error, request);
    return;
  }

  // Fallback for older SDKs
  try {
    Sentry.captureException(error, scope => {
      try {
        scope.setTag("runtime", "server");
        scope.setContext("request", {
          url: request?.url,
          method: request?.method,
        });
      } catch {
        /* no-op */
      }
      return scope;
    });
  } catch {
    /* no-op */
  }
}

/**
 * Optional: capture other unhandled server errors (e.g., thrown during rendering).
 * Next may call this hook depending on the error surface.
 */
export function onUnhandledError(error: unknown) {
  try {
    Sentry.captureException(error, scope => {
      scope.setTag("runtime", "server");
      scope.setLevel("error");
      return scope;
    });
  } catch {
    /* no-op */
  }
}

/**
 * Tiny dev helper: expose a safe test hook in non-prod (node console).
 * Usage (server logs): global.__testSentryServer?.("hello")
 */
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
  } catch {
    /* no-op */
  }
}
