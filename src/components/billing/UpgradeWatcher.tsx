// src/components/billing/UpgradeWatcher.tsx
"use client";

import React from "react";
import { usePaymentStatusPoll } from "@/app/hooks/usePaymentStatusPoll";

type DoneStatus = "SUCCESS" | "FAILED" | "TIMEOUT";

export default function UpgradeWatcher({
  paymentId,
  onDoneAction,
  className = "",
  poll = {
    intervalMs: 2000,
    maxIntervalMs: 10_000,
    maxAttempts: 60,
  },
}: {
  paymentId: string;
  onDoneAction?: (status: DoneStatus) => void;
  /** Optional container className */
  className?: string;
  /** Optional polling config overrides */
  poll?: Partial<{
    intervalMs: number;
    maxIntervalMs: number;
    maxAttempts: number;
  }>;
}) {
  // Guard: no ID -> show hint (don’t start polling).
  if (!paymentId) {
    return (
      <div
        className={`text-sm text-gray-600 dark:text-slate-300 ${className}`}
        role="status"
        aria-live="polite"
      >
        Waiting for payment ID…
      </div>
    );
  }

  // Ensure we only ever call onDone once
  const doneRef = React.useRef(false);
  const handleOnce = React.useCallback(
    (final: DoneStatus) => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDoneAction?.(final);
    },
    [onDoneAction]
  );

  const { status, isPolling, attempts, error } = usePaymentStatusPoll(paymentId, {
    onSuccess: () => handleOnce("SUCCESS"),
    onFailure: () => handleOnce("FAILED"),
    intervalMs: poll.intervalMs ?? 2000,
    maxIntervalMs: poll.maxIntervalMs ?? 10_000,
    maxAttempts: poll.maxAttempts ?? 60,
  });

  // If hook reports an error and we’re no longer polling, treat as TIMEOUT
  React.useEffect(() => {
    if (error && !isPolling) {
      handleOnce("TIMEOUT");
    }
  }, [error, isPolling, handleOnce]);

  const friendly =
    status === "PENDING"
      ? "Waiting for confirmation…"
      : status === "PROCESSING"
      ? "Processing payment…"
      : status === "SUCCESS"
      ? "Payment successful"
      : status === "FAILED"
      ? "Payment failed"
      : status || "Pending";

  return (
    <div className={`text-sm text-gray-700 dark:text-slate-200 ${className}`}>
      {/* SR live updates */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {friendly}
      </div>

      <div className="flex items-center gap-2">
        {isPolling && <Spinner ariaLabel="Checking payment status" />}
        <div>
          <div>
            Status:{" "}
            <span
              className={
                status === "SUCCESS"
                  ? "font-semibold text-emerald-600"
                  : status === "FAILED"
                  ? "font-semibold text-red-600"
                  : "font-medium"
              }
            >
              {friendly}
            </span>
          </div>
          <div className="text-xs text-gray-500 dark:text-slate-400">
            Checks: {attempts}
            {poll.maxAttempts ? ` / ${poll.maxAttempts}` : null}
            {isPolling ? " • Updating…" : null}
          </div>
          {error ? (
            <div className="mt-1 text-xs text-red-600 dark:text-red-400">
              Note: {String(error)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* Tiny inline spinner to avoid extra deps */
function Spinner({ ariaLabel }: { ariaLabel?: string }) {
  return (
    <span
      className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
      role="img"
      aria-label={ariaLabel}
    />
  );
}
