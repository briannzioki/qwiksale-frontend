// sentry.server.config.ts
import * as Sentry from "@sentry/nextjs";

function scrub(value: unknown): unknown {
  if (typeof value !== "string") return value;
  // Mask KE numbers and M-Pesa IDs
  return value
    .replace(/\b254[17]\d{8}\b/g, (m) => m.slice(0, 6) + "***" + m.slice(-3))
    .replace(/CheckoutRequestID=\w+/g, "CheckoutRequestID=***")
    .replace(/MerchantRequestID=\w+/g, "MerchantRequestID=***");
}

const dsn = process.env.SENTRY_DSN || "";
const environment = process.env.SENTRY_ENV || process.env.NODE_ENV || "development";

Sentry.init({
  dsn,
  environment,
  // Server performance (tune to taste)
  tracesSampleRate: 0.2,
  profilesSampleRate: 0.1,
  sendDefaultPii: false,

  beforeSend(event) {
    try {
      if (event.request) {
        // Drop potentially sensitive request bits
        delete (event.request as any).cookies;
        delete (event.request as any).headers;
        delete (event.request as any).data;

        // Drop whole request context for M-Pesa endpoints
        if (event.request.url?.includes("/api/mpesa")) {
          delete (event as any).request;
        }
      }

      // Scrub exception messages and frame vars
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.value) ex.value = String(scrub(ex.value));
          if (ex.stacktrace?.frames) {
            for (const f of ex.stacktrace.frames) {
              if (f.vars) {
                for (const k of Object.keys(f.vars)) {
                  f.vars[k] = scrub(f.vars[k]);
                }
              }
            }
          }
        }
      }
    } catch {
      /* no-op */
    }
    return event;
  },

  denyUrls: [/^chrome-extension:\/\//, /extensions\//, /^moz-extension:\/\//],
});
