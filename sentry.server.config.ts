// sentry.server.config.ts
import * as Sentry from "@sentry/nextjs";

/* ------------------------------ env ------------------------------ */

const dsn =
  process.env['SENTRY_DSN'] ??
  process.env['NEXT_PUBLIC_SENTRY_DSN'] ??
  undefined;

const environment =
  process.env['SENTRY_ENV'] ??
  process.env.NODE_ENV ??
  "development";

const isProd = environment === "production";

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

/* ---------------------------- options ---------------------------- */
const options: Sentry.NodeOptions = {
  environment,
  tracesSampleRate: isProd ? 0.2 : 0.05,
  profilesSampleRate: isProd ? 0.1 : 0,
  sendDefaultPii: false,

  initialScope: (scope) => {
    scope.setTag("runtime", "server");
    return scope;
  },

  // Use `any` here to avoid needing `@sentry/types`
  beforeSend(event: any, _hint: any): any {
    try {
      const next: any = { ...event };

      if (next.request) {
        const req: Record<string, unknown> = { ...(next.request as any) };
        const url = String(req["url"] ?? "");

        // Don’t send raw MPESA request details
        if (url.includes("/api/mpesa")) {
          delete next.request;
        } else {
          delete req["cookies"];
          delete req["headers"];
          delete req["data"];
          next.request = req;
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
      return event;
    }
  },
};

if (dsn) options.dsn = dsn;

Sentry.init(options);
