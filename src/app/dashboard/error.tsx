// src/app/dashboard/error.tsx
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
    console.error("[dashboard:error]", {
      message: error?.message,
      digest: (error as any)?.digest,
    });
  }, [error]);

  const onRetry = React.useCallback(() => {
    reset();
  }, [reset]);

  return (
    <div
      className="container-page py-4 text-[var(--text)] sm:py-6"
      data-testid="soft-error"
      data-soft-error="dashboard"
    >
      {/* Headline that the guardrail test searches for */}
      <div className="mb-2 text-sm font-semibold sm:text-base">
        We hit a dashboard error
      </div>

      <div className="mx-auto max-w-3xl">
        <ErrorBanner
          title="We hit a dashboard error"
          message="Something went wrong loading your dashboard. You can try again."
          variant="error"
          onRetryAction={onRetry}
          retryLabel="Retry"
          className="mb-3 sm:mb-4"
        />

        <div
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-6"
          role="region"
          aria-labelledby="dash-error-title"
        >
          <h2
            id="dash-error-title"
            className="text-base font-semibold text-[var(--text)] sm:text-lg"
          >
            Let’s try that again
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
            If the problem keeps happening, please contact support - it helps us
            fix things faster.
          </p>

          <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
            <button
              type="button"
              onClick={onRetry}
              className="btn-gradient-primary"
            >
              Retry
            </button>
            <a href="/" className="btn-outline">
              Go home
            </a>
            <a
              href="/help"
              className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text)] shadow-soft transition hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:text-sm"
            >
              Help Center
            </a>
          </div>

          {SHOW_DEV_DETAILS && (
            <details className="mt-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 text-sm text-[var(--text)] shadow-soft sm:mt-6 sm:p-4">
              <summary className="cursor-pointer select-none font-semibold">
                Error details (dev)
              </summary>
              <div className="mt-2 space-y-2">
                {error?.message ? (
                  <p>
                    <span className="font-medium">Message:</span>{" "}
                    {String(error.message)}
                  </p>
                ) : null}
                {"digest" in error && (error as any).digest ? (
                  <p>
                    <span className="font-medium">Digest:</span>{" "}
                    {String((error as any).digest)}
                  </p>
                ) : null}
                {error?.stack ? (
                  <pre className="overflow-auto rounded-md border border-[var(--border-subtle)] bg-[var(--bg)] p-3 text-xs text-[var(--text)]">
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
