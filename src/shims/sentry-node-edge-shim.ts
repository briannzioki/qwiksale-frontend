/* Minimal no-op shim so Edge/client bundles never pull Node-only Sentry code */
const noop = () => {};
const SentryShim = {
  init: noop,
  captureException: noop,
  captureMessage: noop,
  addBreadcrumb: noop,
  setTag: noop,
  captureRequestError: noop,
  // keep the name to match our server code guard
  captureConsoleIntegration: undefined,
} as const;

export type SentryShimType = typeof SentryShim;
export default SentryShim;
