import * as Sentry from "@sentry/nextjs";

/** Best-effort dynamic import that won’t crash in either src/ or app/ layouts */
async function tryImport(path: string) {
  try {
    return await import(path);
  } catch {
    return undefined;
  }
}

/**
 * Next calls this once on server start. Make sure Sentry configs load for both runtimes
 * and tag helpful metadata.
 */
export async function register() {
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
    const environment =
      process.env["SENTRY_ENV"] || process.env.NODE_ENV || "development";
    const release =
      process.env["NEXT_PUBLIC_COMMIT_SHA"] ||
      process.env["VERCEL_GIT_COMMIT_SHA"] ||
      undefined;

    Sentry.setTag("runtime", process.env["NEXT_RUNTIME"] || "nodejs");
    Sentry.setTag("node_env", environment);
    if (release) Sentry.setTag("release", release);
  } catch {}
}

/**
 * Use Sentry v8 helper if present. Next passes only (error), so don’t assume a request arg.
 * Falls back to captureException with minimal context.
 */
export function onRequestError(...args: unknown[]) {
  const [error, reqMaybe] = args as [unknown, Request | undefined];

  const cre = (Sentry as any)?.captureRequestError as
    | ((e: unknown, req?: Request) => void)
    | undefined;

  if (typeof cre === "function") {
    try {
      // Call with 1 arg (what Next provides). If we ever receive a request, pass it through.
      reqMaybe ? cre(error, reqMaybe) : cre(error);
      return;
    } catch {
      // fall through to captureException
    }
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

/** Catch other unhandled server errors (e.g., during rendering) */
export function onUnhandledError(error: unknown) {
  try {
    Sentry.captureException(error, (scope) => {
      scope.setTag("runtime", process.env["NEXT_RUNTIME"] || "nodejs");
      scope.setLevel("error");
      return scope;
    });
  } catch {}
}

/** Tiny dev helper: call in server console as `global.__testSentryServer?.("hi")` */
if (
  process.env.NODE_ENV !== "production" ||
  process.env["NEXT_PUBLIC_SENTRY_DEBUG"] === "1"
) {
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
