// Edge-safe no-op shim for @sentry/node.
export type SeverityLevel = "fatal" | "error" | "warning" | "log" | "info" | "debug";

type Breadcrumb = {
  category?: string;
  message?: string;
  level?: SeverityLevel;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
};

function noop() { /* no-op */ }

export function init(_: unknown) {}
export function setTag(_k: string, _v: unknown) {}
export function addBreadcrumb(_b: Breadcrumb) {}
export function captureException(_e: unknown, _cb?: (_scope: any) => any) {}
export function captureMessage(_m: string) {}
export function setContext(_k: string, _v: unknown) {}
export const Scope = undefined as unknown as any;
export const captureConsoleIntegration = noop as unknown as () => unknown;
