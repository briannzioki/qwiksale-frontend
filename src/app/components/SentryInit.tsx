// src/app/components/SentryInit.tsx
"use client";

import * as Sentry from "@sentry/nextjs";
import type {
  ErrorEvent,
  EventHint,
  Breadcrumb,
  BreadcrumbHint,
} from "@sentry/nextjs";

/* ------------------------- tiny guards/utils ------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object";
}

function scrub(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value
    .replace(/\b254[17]\d{8}\b/g, (m) => m.slice(0, 6) + "***" + m.slice(-3))
    .replace(/CheckoutRequestID=\w+/g, "CheckoutRequestID=***")
    .replace(/MerchantRequestID=\w+/g, "MerchantRequestID=***");
}

/* ------------------------------ env ------------------------------ */
/** ✅ DOT notation so client build inlines values (and avoids `process` at runtime). */
const dsn =
  process.env["SENTRY_DSN"] ??
  process.env["NEXT_PUBLIC_SENTRY_DSN"] ??
  undefined;

const environment =
  process.env["SENTRY_ENV"] ??
  process.env.NODE_ENV ??
  "production";

const isProd = environment === "production";

/* ---------------------------- options ---------------------------- */

const options: Sentry.BrowserOptions = {
  environment,
  tunnel: "/monitoring",

  // Sampling
  tracesSampleRate: isProd ? 0.2 : 0.05,
  profilesSampleRate: isProd ? 0.1 : 0,
  sendDefaultPii: false,

  // NOTE: must be (event: ErrorEvent, hint: EventHint) => ErrorEvent | PromiseLike<ErrorEvent|null> | null
  beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
    try {
      // shallow copy so we can rewrite safely
      const next: ErrorEvent = { ...event };

      if (next.request) {
        const req: Record<string, unknown> = { ...(next.request as any) };
        const url = String(req["url"] ?? "");

        // Drop whole request for sensitive endpoints
        if (url.includes("/api/mpesa")) {
          delete (next as any).request;
        } else {
          // Redact known sensitive fields
          delete req["cookies"];
          delete req["headers"];
          delete req["data"];
          (next as any).request = req;
        }
      }

      const values = next.exception?.values;
      if (Array.isArray(values)) {
        for (const ex of values) {
          if (ex.value) ex.value = String(scrub(ex.value));
          const frames = ex.stacktrace?.frames;
          if (Array.isArray(frames)) {
            for (const f of frames as Array<Record<string, unknown>>) {
              const vars = f["vars"];
              if (isRecord(vars)) {
                for (const k of Object.keys(vars)) vars[k] = scrub(vars[k]);
              }
            }
          }
        }
      }

      return next;
    } catch {
      return event; // if scrubbing fails, return original
    }
  },

  // NOTE: must be (breadcrumb: Breadcrumb, hint?: BreadcrumbHint) => Breadcrumb | null
  beforeBreadcrumb(
    breadcrumb: Breadcrumb,
    _hint?: BreadcrumbHint
  ): Breadcrumb | null {
    try {
      if (breadcrumb?.message) {
        breadcrumb.message = String(scrub(breadcrumb.message));
      }
      if (isRecord(breadcrumb?.data)) {
        const d = breadcrumb.data as Record<string, unknown>;
        if (typeof d["url"] === "string") d["url"] = String(scrub(d["url"]));
        if (typeof d["request_body"] === "string")
          d["request_body"] = String(scrub(d["request_body"]));
        if (typeof d["response_body"] === "string")
          d["response_body"] = String(scrub(d["response_body"]));
      }
    } catch {
      /* no-op */
    }
    return breadcrumb;
  },

  // Mutable array type (avoid readonly)
  denyUrls: [
    /^chrome-extension:\/\//,
    /extensions\//,
    /^moz-extension:\/\//,
  ] as Array<string | RegExp>,

  // Lightweight default integrations
  integrations: [
    Sentry.browserTracingIntegration?.(),
    Sentry.replayIntegration?.(),
  ].filter(Boolean) as NonNullable<Sentry.BrowserOptions["integrations"]>,
};

// Only set dsn when defined (critical for exactOptionalPropertyTypes)
if (dsn) options.dsn = dsn;

// Prevent double-init in dev/HMR
declare global {
  // eslint-disable-next-line no-var
  var __QS_SENTRY_INIT__: boolean | undefined;
}
if (!globalThis.__QS_SENTRY_INIT__) {
  Sentry.init(options);
  globalThis.__QS_SENTRY_INIT__ = true;
}

export default function SentryInit() {
  return null;
}
