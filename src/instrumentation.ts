// src/instrumentation.ts
/**
 * Server instrumentation that never imports @sentry/node on Edge,
 * and fully disables in E2E (no SDK init, no beacons).
 */
type Sdk = {
  init: (opts: any) => void;
  setTag: (k: string, v: string) => void;
  captureException: (e: unknown, scopeCb?: (s: any) => any) => void;
  captureMessage?: (m: unknown) => void;
  addBreadcrumb?: (b: any) => void;
  captureRequestError?: (e: unknown, req?: Request) => void;
  captureConsoleIntegration?: (opts: any) => any;
};

let _sdk: Sdk | null = null;

function isEdgeRuntime(): boolean {
  try {
    // @ts-ignore
    if (typeof EdgeRuntime === "string") return true;
  } catch {}
  return process.env["NEXT_RUNTIME"] === "edge";
}

async function getSdk(): Promise<Sdk> {
  if (_sdk) return _sdk;
  if (isEdgeRuntime()) {
    const mod = await import("@/shims/sentry-node");
    _sdk = (mod as unknown) as Sdk;
  } else {
    _sdk = (await import("@sentry/node")) as unknown as Sdk;
  }
  return _sdk!;
}

function shouldDisableEntirely(): boolean {
  if (process.env["NEXT_PUBLIC_E2E"] === "1") return true;
  if (process.env["DISABLE_SENTRY"] === "1") return true;
  const dsn = process.env["SENTRY_DSN"] || process.env["NEXT_PUBLIC_SENTRY_DSN"] || "";
  if (!dsn) return true;
  return false;
}

function computeTraceRate(): number {
  const isProd = process.env.NODE_ENV === "production";
  const fromEnv = Number.parseFloat(process.env["SENTRY_TRACES_SAMPLE_RATE"] || "");
  if (!Number.isNaN(fromEnv)) return Math.max(0, Math.min(1, fromEnv));
  return isProd ? 0.2 : 0;
}

export async function register() {
  if (shouldDisableEntirely()) return;

  const Sentry = await getSdk();

  const dsn = process.env["SENTRY_DSN"] || process.env["NEXT_PUBLIC_SENTRY_DSN"] || "";
  const environment = process.env["SENTRY_ENV"] || process.env.NODE_ENV || "development";
  const releaseMaybe = process.env["VERCEL_GIT_COMMIT_SHA"] || process.env["NEXT_PUBLIC_COMMIT_SHA"] || undefined;
  const useTunnel = process.env["SENTRY_TUNNEL"] !== "0" && process.env["NEXT_PUBLIC_SENTRY_TUNNEL"] !== "0";

  const tracesSampleRate = computeTraceRate();
  const wantTracing = tracesSampleRate > 0;

  const extras: unknown[] = [];
  const captureConsole = (Sentry as any).captureConsoleIntegration;
  if (typeof captureConsole === "function") {
    extras.push(captureConsole({ levels: ["error", "warn"] }));
  }

  try {
    Sentry.init({
      dsn,
      environment,
      release: releaseMaybe,
      ...(useTunnel ? { tunnel: "/api/monitoring" } : {}),
      ...(wantTracing ? { tracesSampleRate } : {}),
      debug: process.env["SENTRY_DEBUG"] === "1" || process.env["NEXT_PUBLIC_SENTRY_DEBUG"] === "1",
      ...( { telemetry: false } as any ),
      integrations(defaults: any[]) {
        return wantTracing ? [...defaults, ...(extras as any[])] : defaults;
      },
      beforeSend(event: any) {
        try {
          const url = (event as any)?.request?.url;
          if (typeof url === "string" && url.includes("/api/mpesa")) {
            delete (event as any).request;
          }
        } catch {}
        return event;
      },
    });
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[sentry] disabled during dev/e2e due to init error:", (e as Error)?.message);
      return;
    }
    throw e;
  }

  try {
    Sentry.setTag("runtime", isEdgeRuntime() ? "edge" : "node");
    Sentry.setTag("node_env", environment);
    if (releaseMaybe) Sentry.setTag("release", releaseMaybe);
  } catch {}
}

export async function onRequestError(error: unknown, reqMaybe?: Request) {
  const Sentry = await getSdk();
  const cre = (Sentry as any)?.captureRequestError as ((e: unknown, req?: Request) => void) | undefined;
  if (typeof cre === "function") {
    try {
      reqMaybe ? cre(error, reqMaybe) : cre(error);
      return;
    } catch {}
  }
  try {
    Sentry.captureException(error, (scope: any) => {
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

export async function onUnhandledError(error: unknown) {
  const Sentry = await getSdk();
  try {
    Sentry.captureException(error, (scope: any) => {
      scope.setTag("runtime", process.env["NEXT_RUNTIME"] || "nodejs");
      scope.setLevel("error");
      return scope;
    });
  } catch {}
}

// Dev helper
if (process.env.NODE_ENV !== "production" || process.env["NEXT_PUBLIC_SENTRY_DEBUG"] === "1") {
  try {
    (globalThis as any).__testSentryServer = async (msg?: unknown) => {
      try {
        const Sentry = await getSdk();
        Sentry.captureMessage?.(String(msg ?? "qwiksale: server test event"));
        return true;
      } catch {
        return false;
      }
    };
  } catch {}
}
