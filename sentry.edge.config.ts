import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || "";
const environment = process.env.SENTRY_ENV || process.env.NODE_ENV || "development";
const releaseMaybe = process.env.VERCEL_GIT_COMMIT_SHA || undefined;

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release: releaseMaybe,

    tracesSampleRate: 0.2,
    debug: process.env.NEXT_PUBLIC_SENTRY_DEBUG === "1",
    sendDefaultPii: true,

    ...( { telemetry: false } as any ),
  });

  try {
    Sentry.setTag("runtime", "edge");
    if (releaseMaybe) Sentry.setTag("release", releaseMaybe);
  } catch {}
}
