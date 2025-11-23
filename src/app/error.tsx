"use client";

// src/app/error.tsx

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { track } from "@/app/lib/analytics";

const SHOW_DEV_DETAILS =
  process.env["NODE_ENV"] !== "production" ||
  process.env["NEXT_PUBLIC_SHOW_DEV_CONTROLS"] === "1";

/** Safely extract a digest if present (Next attaches this sometimes). */
function getDigest(err: unknown): string | null {
  const d = (err as any)?.digest;
  return typeof d === "string" && d.trim() ? d : null;
}

/** Robust message extraction so UI never shows "undefined". */
function getMessage(err: unknown): string {
  const m = (err as any)?.message;
  return typeof m === "string" && m.trim() ? m : "Unknown error";
}

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const sentRef = React.useRef(false);

  const digest = getDigest(error);
  const message = getMessage(error);
  const path =
    typeof location !== "undefined" ? location.pathname : undefined;

  React.useEffect(() => {
    // Local console for quick inspection (dev only effectively)
    // eslint-disable-next-line no-console
    console.error("[app:error]", {
      message,
      digest,
      path,
    });

    if (sentRef.current) return;
    sentRef.current = true;

    // Lightweight analytics breadcrumb
    try {
      track("page_error" as any, {
        msg: message.slice(0, 300),
        digest,
        path,
      });
    } catch (e) {
      // no-op
    }

    // Optional Sentry raise (if client SDK present)
    try {
      // @ts-ignore
      if (window.Sentry?.captureException) {
        // @ts-ignore
        window.Sentry.captureException(error, {
          tags: { source: "app-error-boundary" },
          extra: { digest, path },
        });
      }
    } catch {
      // no-op
    }
    // We intentionally depend on stable values only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, digest, path, error]);

  const onRetry = React.useCallback(() => {
    try {
      track("page_error_retry" as any, { digest, path });
    } catch {}
    reset();
  }, [digest, path, reset]);

  const onGoHome = React.useCallback(() => {
    try {
      track("page_error_home" as any, { digest, path });
    } catch {}
  }, [digest, path]);

  const onReport = React.useCallback(() => {
    try {
      track("report_submitted", { source: "error_page", digest, path });
    } catch {}
  }, [digest, path]);

  const onReload = React.useCallback(() => {
    try {
      track("page_error_reload" as any, { digest, path });
    } catch {}
    if (typeof window !== "undefined") window.location.reload();
  }, [digest, path]);

  const onBack = React.useCallback(() => {
    try {
      track("page_error_back" as any, { digest, path });
    } catch {}
    try {
      router.back();
    } catch {}
  }, [digest, path, router]);

  const onCopy = React.useCallback(async () => {
    try {
      const payload = {
        message,
        digest,
        path,
        ts: new Date().toISOString(),
      };
      await navigator.clipboard.writeText(
        JSON.stringify(payload, null, 2),
      );
      track("page_error_copy" as any, { digest, path });
    } catch {
      // no-op
    }
  }, [message, digest, path]);

  return (
    <div className="pb-10">
      {/* Branded hero */}
      <header
        className="bg-spotlight bg-noise text-white"
        style={{
          WebkitMaskImage:
            "linear-gradient(to bottom, black 80%, transparent)",
        }}
      >
        <div className="container-page pt-12 pb-8 md:pt-14 md:pb-10">
          <p className="text-sm/5 opacity-90">Something went wrong</p>
          <h1 className="mt-1 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            We hit a snag loading this page
          </h1>
          <p className="mt-2 max-w-prose text-sm text-white/90">
            You can try again, go back, reload, or report the issue.
          </p>

          {/* Quick chips */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={onRetry} className="chip chip--light" autoFocus>
              Try again
            </button>
            <button onClick={onBack} className="chip chip--light">
              Go back
            </button>
            <button onClick={onReload} className="chip chip--light">
              Reload
            </button>
            <button onClick={onCopy} className="chip chip--light">
              Copy details
            </button>
            <Link
              href="/"
              prefetch={false}
              className="chip chip--light"
              onClick={onGoHome}
            >
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
        <div
          className="rounded-2xl border border-border bg-card p-6 shadow-sm"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">
                Let’s get you back on track
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                If the problem keeps happening, please let us know — it helps
                us fix things faster.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="btn-gradient-primary"
            >
              Try again
            </button>

            <Link
              href="/"
              prefetch={false}
              className="btn-outline"
              onClick={onGoHome}
            >
              Go home
            </Link>

            <Link
              href="/contact"
              prefetch={false}
              onClick={onReport}
              className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
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
                {message ? (
                  <p>
                    <span className="font-medium">Message:</span>{" "}
                    {String(message)}
                  </p>
                ) : null}
                {digest ? (
                  <p>
                    <span className="font-medium">Digest:</span>{" "}
                    {String(digest)}
                  </p>
                ) : null}
                {error?.stack ? (
                  <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
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
            className="rounded-xl border border-border bg-card p-4 text-foreground shadow-sm hover:shadow-md"
          >
            <div className="text-lg font-semibold">Browse listings</div>
            <div className="text-sm text-muted-foreground">
              Products &amp; services by category
            </div>
          </Link>

          <Link
            href="/sell"
            prefetch={false}
            className="rounded-xl border border-border bg-card p-4 text-foreground shadow-sm hover:shadow-md"
          >
            <div className="text-lg font-semibold">Sell an item</div>
            <div className="text-sm text-muted-foreground">
              Post your listing
            </div>
          </Link>

          <Link
            href="/help"
            prefetch={false}
            className="rounded-xl border border-border bg-card p-4 text-foreground shadow-sm hover:shadow-md"
          >
            <div className="text-lg font-semibold">Help Center</div>
            <div className="text-sm text-muted-foreground">
              Safety tips &amp; FAQs
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
