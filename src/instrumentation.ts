import * as Sentry from "@sentry/nextjs";

/** Best-effort dynamic import that won’t crash whether we’re in src/ or app/ */
async function tryImport(path: string) {
  try {
    return await import(path);
  } catch {
    return undefined;
  }
}

export async function register() {
  // Ensure the appropriate runtime config file runs exactly once
  if (process.env["NEXT_RUNTIME"] === "nodejs") {
    await (
      tryImport("../sentry.server.config") ||
      tryImport("../../sentry.server.config") ||
      tryImport("./sentry.server.config")
    );
  }

  if (process.env["NEXT_RUNTIME"] === "edge") {
    await (
      tryImport("../sentry.edge.config") ||
      tryImport("../../sentry.edge.config") ||
      tryImport("./sentry.edge.config")
    );
  }

  try {
    const environment = process.env["SENTRY_ENV"] || process.env.NODE_ENV || "development";
    const release = process.env["NEXT_PUBLIC_COMMIT_SHA"] || process.env["VERCEL_GIT_COMMIT_SHA"] || undefined;

    Sentry.setTag("runtime", process.env["NEXT_RUNTIME"] || "nodejs");
    Sentry.setTag("node_env", environment);
    if (release) Sentry.setTag("release", release);
  } catch {}
}

export function onRequestError(...args: unknown[]) {
  const [error, reqMaybe] = args as [unknown, Request | undefined];
  const cre = (Sentry as any)?.captureRequestError as
    | ((e: unknown, req?: Request) => void)
    | undefined;

  if (typeof cre === "function") {
    try {
      reqMaybe ? cre(error, reqMaybe) : cre(error);
      return;
    } catch {}
  }

  try {
    Sentry.captureException(error, (scope) => {
      scope.setTag("runtime", process.env["NEXT_RUNTIME"] || "nodejs");
      if (reqMaybe) {
        try {
          scope.setContext("request", { url: reqMaybe.url, method: reqMaybe.method });
        } catch {}
      }
      return scope;
    });
  } catch {}
}

export function onUnhandledError(error: unknown) {
  try {
    Sentry.captureException(error, (scope) => {
      scope.setTag("runtime", process.env["NEXT_RUNTIME"] || "nodejs");
      scope.setLevel("error");
      return scope;
    });
  } catch {}
}

// Dev helper
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
  } catch {}
}
