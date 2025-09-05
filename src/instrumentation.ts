// src/instrumentation.ts
import * as Sentry from "@sentry/nextjs";
// Your server config lives at project root, so go up one level:
import "../sentry.server.config";

/** Boot hook (server). Nothing else needed since we imported the config above. */
export async function register() {}

/** Capture server request errors (quiet Sentry’s request-error hook warning). */
export function onRequestError(error: unknown, request: Request) {
  // Sentry 8+ helper; guarded in case types lag
  // @ts-ignore
  Sentry.captureRequestError?.(error, request);
}
