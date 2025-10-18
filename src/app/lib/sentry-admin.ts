import * as Sentry from "@sentry/nextjs";

export function adminBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
  level: Sentry.SeverityLevel = "info"
) {
  Sentry.setTag("area", "admin");
  const crumb: Sentry.Breadcrumb = {
    category: "admin.action",
    message,
    level,
    // do NOT include `data` when undefined (avoids TS error with exactOptionalPropertyTypes)
  };
  if (data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (crumb as any).data = data;
  }
  Sentry.addBreadcrumb(crumb);
}

export function adminCapture(err: unknown, extras?: Record<string, unknown>) {
  Sentry.captureException(err, (scope) => {
    scope.setTag("area", "admin");
    if (extras) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scope.setExtras(extras as any);
    }
    return scope;
  });
}
