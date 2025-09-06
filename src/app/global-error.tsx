// src/app/global-error.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

type Props = {
  error: Error & { digest?: string };
  /** Next.js provides this in error boundaries; may be absent in global boundary */
  reset?: () => void;
};

export default function GlobalError({ error, reset }: Props) {
  // Capture once per mount, keep the eventId so we can open the feedback dialog.
  const eventIdRef = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    try {
      const id = Sentry.captureException?.(error);
      // Sentry can return undefined if SDK isn’t initialized
      if (typeof id === "string") eventIdRef.current = id;
    } catch {
      // ignore – don’t let error UI throw
    }
    // We intentionally don’t re-capture on rerenders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openFeedback = React.useCallback(() => {
    try {
      // Some bundles don’t expose showReportDialog; guard with optional chaining
      (Sentry as any)?.showReportDialog?.({
        eventId: eventIdRef.current,
        // You can add more data here if desired:
        // title: "Tell us what happened",
      });
    } catch {
      // Fallback: no-op
    }
  }, []);

  const onReload = React.useCallback(() => {
    try {
      window.location.reload();
    } catch {
      // no-op
    }
  }, []);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: "100dvh",
            display: "grid",
            placeItems: "center",
            padding: 24,
            background:
              "linear-gradient(135deg, rgba(22,23,72,.04), rgba(57,160,202,.06))",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 560,
              background: "white",
              color: "#0b1220",
              borderRadius: 16,
              padding: 20,
              boxShadow:
                "0 10px 30px rgba(0,0,0,0.08), 0 2px 10px rgba(0,0,0,0.05)",
            }}
          >
            <h1 style={{ fontWeight: 800, fontSize: 20, margin: 0 }}>
              Something went wrong
            </h1>
            <p style={{ marginTop: 8, opacity: 0.85 }}>
              We’ve been notified and are looking into it. You can try again or
              head back home.
            </p>

            {/* Helpful tech info (non-sensitive) */}
            {(error?.digest || eventIdRef.current) && (
              <div
                style={{
                  marginTop: 12,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                  fontSize: 12,
                  background: "#f8fafc",
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: "8px 10px",
                  color: "#334155",
                }}
              >
                {eventIdRef.current && (
                  <div>
                    eventId: <strong>{eventIdRef.current}</strong>
                  </div>
                )}
                {error?.digest && (
                  <div>
                    digest: <strong>{error.digest}</strong>
                  </div>
                )}
              </div>
            )}

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 16,
              }}
            >
              {typeof reset === "function" ? (
                <button
                  onClick={reset}
                  style={btnPrimary}
                  aria-label="Retry rendering this page"
                >
                  Try again
                </button>
              ) : (
                <button
                  onClick={onReload}
                  style={btnPrimary}
                  aria-label="Reload this page"
                >
                  Reload
                </button>
              )}

              <Link href="/" style={btnOutline} aria-label="Go to homepage">
                Go home
              </Link>

              {/* Only works if Sentry SDK + DSN are configured */}
              <button
                onClick={openFeedback}
                style={btnGhost}
                aria-label="Send additional feedback"
              >
                Send feedback
              </button>
            </div>

            {/* Optional: minimal details for local/dev builds */}
            {process.env.NODE_ENV !== "production" && error?.message && (
              <details style={{ marginTop: 16 }}>
                <summary
                  style={{ cursor: "pointer", fontSize: 13, opacity: 0.8 }}
                >
                  Show error details (dev)
                </summary>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 12,
                    marginTop: 8,
                    background: "#0b1220",
                    color: "#e5e7eb",
                    padding: 12,
                    borderRadius: 12,
                    overflowX: "auto",
                  }}
                >
                  {String(error.stack || error.message || error)}
                </pre>
              </details>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}

/* ----------------------------- tiny button styles ----------------------------- */
const btnBase: React.CSSProperties = {
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 600,
  fontSize: 14,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: "#161748",
  color: "white",
  border: "1px solid rgba(22,23,72,.9)",
};

const btnOutline: React.CSSProperties = {
  ...btnBase,
  background: "white",
  color: "#0b1220",
  border: "1px solid #e5e7eb",
};

const btnGhost: React.CSSProperties = {
  ...btnBase,
  background: "transparent",
  color: "#0b1220",
  border: "1px solid transparent",
};
