import "server-only";
import * as Sentry from "@sentry/node";

export function adminBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
  level: Sentry.SeverityLevel = "info",
) {
  try {
    Sentry.setTag("area", "admin");
    const crumb: any = { category: "admin.action", message, level };
    if (data) crumb.data = data;
    Sentry.addBreadcrumb?.(crumb);
  } catch {}
}

export function adminCapture(err: unknown, extras?: Record<string, unknown>) {
  try {
    Sentry.captureException(err, (scope: any) => {
      scope.setTag("area", "admin");
      if (extras) scope.setExtras(extras as any);
      return scope;
    });
  } catch {}
}
