"use client";

import * as React from "react";
import ErrorBanner from "@/app/components/ErrorBanner";

const SHOW_DEV_DETAILS =
  process.env.NODE_ENV !== "production" ||
  process.env["NEXT_PUBLIC_SHOW_DEV_CONTROLS"] === "1";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[dashboard:error]", { message: error?.message, digest: (error as any)?.digest });
  }, [error]);

  const onRetry = React.useCallback(() => {
    reset();
  }, [reset]);

  return (
    <div className="container-page py-6">
      {/* Headline that the guardrail test searches for */}
      <div className="mb-2 text-base font-semibold">We hit a dashboard error</div>

      <div className="mx-auto max-w-3xl">
        <ErrorBanner
          title="We hit a dashboard error"
          message="Something went wrong loading your dashboard. You can try again."
          variant="error"
          onRetryAction={onRetry}
          retryLabel="Retry"
          className="mb-4"
        />

        <div className="rounded-2xl border bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold">Let’s try that again</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
            If the problem keeps happening, please contact support — it helps us fix things faster.
          </p>

          <div className="mt-4 flex gap-2">
            <button type="button" onClick={onRetry} className="btn-gradient-primary">
              Retry
            </button>
            <a href="/" className="btn-outline">Go home</a>
            <a
              href="/help"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Help Center
            </a>
          </div>

          {SHOW_DEV_DETAILS && (
            <details className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100">
              <summary className="cursor-pointer select-none font-semibold">Error details (dev)</summary>
              <div className="mt-2 space-y-2">
                {error?.message ? (
                  <p>
                    <span className="font-medium">Message:</span> {String(error.message)}
                  </p>
                ) : null}
                {"digest" in error && (error as any).digest ? (
                  <p>
                    <span className="font-medium">Digest:</span> {String((error as any).digest)}
                  </p>
                ) : null}
                {error?.stack ? (
                  <pre className="overflow-auto rounded-md bg-black/5 p-3 text-xs dark:bg-white/10">
                    {error.stack}
                  </pre>
                ) : null}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
