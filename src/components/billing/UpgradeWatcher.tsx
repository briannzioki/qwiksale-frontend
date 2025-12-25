"use client";
// src/components/billing/UpgradeWatcher.tsx

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
        className={`text-sm text-[var(--text-muted)] ${className}`}
        role="status"
        aria-live="polite"
      >
        Waiting for payment ID…
      </div>
    );
  }

  // Ensure we only ever call onDone once (still passive).
  const doneRef = React.useRef(false);
  const handleOnce = React.useCallback(
    (final: DoneStatus) => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDoneAction?.(final);
    },
    [onDoneAction],
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

  const statusClass =
    status === "SUCCESS"
      ? "font-semibold text-[color:var(--success,var(--text))]"
      : status === "FAILED"
        ? "font-semibold text-[var(--danger)]"
        : "font-medium text-[var(--text)]";

  return (
    <div className={`text-sm text-[var(--text)] ${className}`}>
      {/* SR live updates */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {friendly}
      </div>

      <div className="flex items-center gap-2">
        {isPolling && <Spinner ariaLabel="Checking payment status" />}
        <div>
          <div>
            Status: <span className={statusClass}>{friendly}</span>
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            Checks: {attempts}
            {poll.maxAttempts ? ` / ${poll.maxAttempts}` : null}
            {isPolling ? " • Updating…" : null}
          </div>
          {error ? (
            <div className="mt-1 text-xs text-[var(--danger)]">
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
