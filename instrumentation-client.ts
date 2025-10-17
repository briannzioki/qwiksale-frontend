// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";
import { replayIntegration } from "@sentry/replay";

const dsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN ??
  process.env.SENTRY_DSN ??
  undefined;

const environment =
  process.env.SENTRY_ENV ??
  process.env.NODE_ENV ??
  "development";

const isProd = environment === "production";

// Toggle via env if you need: NEXT_PUBLIC_SENTRY_REPLAY=1
const REPLAY_ENABLED =
  (process.env.NEXT_PUBLIC_SENTRY_REPLAY === "1" || isProd) && !!dsn;

// Conservative defaults; bump if you need more coverage
const tracesSampleRate = isProd ? 0.1 : 0.05;
const profilesSampleRate = 0; // keep client profiling off unless you really need it

// Replay sampling (sessions vs on-error)
const replaysSessionSampleRate = isProd ? 0.02 : 0.2; // % of ALL sessions to record
const replaysOnErrorSampleRate = 1.0;                  // 100% of sessions with an error

Sentry.init({
  dsn,
  environment,
  tracesSampleRate,
  profilesSampleRate,

  // Only add Replay when enabled
  integrations: REPLAY_ENABLED
    ? [
        replayIntegration({
          // Privacy hardening
          maskAllText: true,
          blockAllMedia: true,
          // Sampling
          sessionSampleRate: replaysSessionSampleRate,
          errorSampleRate: replaysOnErrorSampleRate,
          // Optional: scrub specific inputs/selectors you never want recorded
          // mask: ['[data-sensitive="true"]', 'input[name="mpesa"]'],
        }),
      ]
    : [],

  // Trim junky domains from stack traces / noise
  denyUrls: [
    /chrome-extension:\/\//i,
    /moz-extension:\/\//i,
    /safari-web-extension:\/\//i,
  ],

  beforeSend(event) {
    try {
      const scrub = (v: unknown) =>
        typeof v === "string"
          ? v
              // Mask Kenyan MSISDNs (2547/2541)
              .replace(/\b254[17]\d{8}\b/g, (m) => m.slice(0, 6) + "***" + m.slice(-3))
              // Mask M-Pesa IDs commonly logged
              .replace(/CheckoutRequestID=\w+/g, "CheckoutRequestID=***")
              .replace(/MerchantRequestID=\w+/g, "MerchantRequestID=***")
          : v;

      const next = { ...event };

      // Clean exception values & any frame local vars
      const values = next.exception?.values;
      if (Array.isArray(values)) {
        for (const ex of values) {
          if (ex.value) ex.value = String(scrub(ex.value));
          const frames = ex.stacktrace?.frames;
          if (Array.isArray(frames)) {
            for (const f of frames as Array<Record<string, unknown>>) {
              const vars = f["vars"];
              if (vars && typeof vars === "object") {
                for (const k of Object.keys(vars)) (vars as any)[k] = scrub((vars as any)[k]);
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
});
