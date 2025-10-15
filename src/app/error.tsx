// src/app/error.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { track } from "@/app/lib/analytics";

const SHOW_DEV_DETAILS =
  process.env.NODE_ENV !== "production" ||
  process.env['NEXT_PUBLIC_SHOW_DEV_CONTROLS'] === "1";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const sentRef = React.useRef(false);

  React.useEffect(() => {
    // Log locally
    // eslint-disable-next-line no-console
    console.error("[app:error]", { message: error?.message, digest: (error as any)?.digest });

    if (sentRef.current) return;
    sentRef.current = true;

    // Analytics breadcrumb
    try {
      track("page_error" as any, {
        msg: error?.message?.slice?.(0, 300) ?? "Unknown",
        digest: (error as any)?.digest ?? null,
        path: typeof location !== "undefined" ? location.pathname : undefined,
      });
    } catch {}

    // Optional Sentry raise (if client SDK present)
    try {
      // @ts-ignore
      if (window.Sentry?.captureException) {
        // @ts-ignore
        window.Sentry.captureException(error, {
          tags: { source: "app-error-boundary" },
          extra: { digest: (error as any)?.digest },
        });
      }
    } catch {}
  }, [error]);

  const onRetry = React.useCallback(() => {
    try {
      track("page_error_retry" as any, {
        digest: (error as any)?.digest ?? null,
        path: typeof location !== "undefined" ? location.pathname : undefined,
      });
    } catch {}
    reset();
  }, [error, reset]);

  const onGoHome = React.useCallback(() => {
    try {
      track("page_error_home" as any, { digest: (error as any)?.digest ?? null });
    } catch {}
  }, [error]);

  const onReport = React.useCallback(() => {
    try {
      track("report_submitted", { source: "error_page", digest: (error as any)?.digest ?? null });
    } catch {}
  }, [error]);

  return (
    <div className="pb-10">
      {/* Branded hero */}
      <header
        className="bg-spotlight bg-noise text-white"
        style={{ WebkitMaskImage: "linear-gradient(to bottom, black 80%, transparent)" }}
      >
        <div className="container-page pt-12 pb-8 md:pt-14 md:pb-10">
          <p className="text-sm/5 opacity-90">Something went wrong</p>
          <h1 className="mt-1 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            We hit a snag loading this page
          </h1>
          <p className="mt-2 max-w-prose text-sm text-white/90">
            You can try again, go back home, or report the issue.
          </p>

          {/* Quick chips */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={onRetry} className="chip chip--light">
              Try again
            </button>
            <Link href="/" prefetch={false} className="chip chip--light" onClick={onGoHome}>
              Home
            </Link>
            <Link
              href="/help"
              prefetch={false}
              className="chip chip--light"
              onClick={onReport}
            >
              Report / Help
            </Link>
          </div>
        </div>
      </header>

      {/* Body card with optional details */}
      <div className="container-page mt-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Let’s get you back on track</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                If the problem persists, please let us know — it helps us fix things faster.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={onRetry} className="btn-gradient-primary">
              Try again
            </button>

            <Link href="/" prefetch={false} className="btn-outline" onClick={onGoHome}>
              Go home
            </Link>

            <Link
              href="/contact"
              prefetch={false}
              onClick={onReport}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Report this issue
            </Link>
          </div>

          {SHOW_DEV_DETAILS && (
            <details className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100">
              <summary className="cursor-pointer select-none font-semibold">
                Error details (dev)
              </summary>
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

        {/* Suggestions */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/search"
            prefetch={false}
            className="rounded-xl border bg-white p-4 text-gray-800 shadow-sm hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <div className="text-lg font-semibold">Browse listings</div>
            <div className="text-sm text-gray-600 dark:text-slate-400">
              Products & services by category
            </div>
          </Link>

          <Link
            href="/sell"
            prefetch={false}
            className="rounded-xl border bg-white p-4 text-gray-800 shadow-sm hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <div className="text-lg font-semibold">Sell an item</div>
            <div className="text-sm text-gray-600 dark:text-slate-400">Post your listing</div>
          </Link>

          <Link
            href="/help"
            prefetch={false}
            className="rounded-xl border bg-white p-4 text-gray-800 shadow-sm hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
          >
            <div className="text-lg font-semibold">Help Center</div>
            <div className="text-sm text-gray-600 dark:text-slate-400">Safety tips & FAQs</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
