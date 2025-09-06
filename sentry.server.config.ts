import * as Sentry from "@sentry/nextjs";

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

const dsn =
  process.env["SENTRY_DSN"] ??
  process.env["NEXT_PUBLIC_SENTRY_DSN"] ??
  undefined;

const environment =
  process.env["SENTRY_ENV"] ??
  process.env["NODE_ENV"] ??
  "development";

const isProd = environment === "production";

/* ---------------------------- options ---------------------------- */

const options: Sentry.BrowserOptions = {
  environment,
  tracesSampleRate: isProd ? 0.2 : 0.05,
  profilesSampleRate: isProd ? 0.1 : 0,
  sendDefaultPii: false,

  // NOTE: must be ErrorEvent + EventHint, and must return ErrorEvent|null
  beforeSend(event: Sentry.ErrorEvent, _hint: Sentry.EventHint): Sentry.ErrorEvent | null {
    try {
      // shallow copy so we can rewrite safely
      const next: Sentry.ErrorEvent = { ...event };

      if (next.request) {
        // Work with a local copy to avoid mutating the original reference
        const req: Record<string, unknown> = { ...(next.request as any) };
        const url = String(req["url"] ?? "");

        // Drop whole request for sensitive endpoints — use delete, not = undefined
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
                for (const k of Object.keys(vars)) {
                  vars[k] = scrub(vars[k]);
                }
              }
            }
          }
        }
      }

      return next;
    } catch {
      return event; // must return the original event on failure
    }
  },

  // Signature allows optional hint and must return Breadcrumb|null
  beforeBreadcrumb(breadcrumb: Sentry.Breadcrumb, _hint?: Sentry.BreadcrumbHint): Sentry.Breadcrumb | null {
    try {
      if (breadcrumb?.message) {
        breadcrumb.message = String(scrub(breadcrumb.message));
      }

      if (isRecord(breadcrumb?.data)) {
        const d = breadcrumb.data as Record<string, unknown>;
        if (typeof d["url"] === "string") d["url"] = String(scrub(d["url"]));
        if (typeof d["request_body"] === "string") d["request_body"] = String(scrub(d["request_body"]));
        if (typeof d["response_body"] === "string") d["response_body"] = String(scrub(d["response_body"]));
      }
    } catch {
      /* no-op */
    }
    return breadcrumb;
  },

  // MUST be mutable (not readonly) to satisfy types
  denyUrls: [
    /^chrome-extension:\/\//,
    /extensions\//,
    /^moz-extension:\/\//,
  ] as Array<string | RegExp>,
};

// Only set dsn when defined (avoid string | undefined mismatch)
if (dsn) options.dsn = dsn;

Sentry.init(options);
