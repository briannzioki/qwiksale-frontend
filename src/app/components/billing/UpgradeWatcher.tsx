// src/app/components/billing/UpgradeWatcher.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePaymentStatusPoll } from "@/app/hooks/usePaymentStatusPoll";

/**
 * Watches an upgrade/payment status and reports progress.
 *
 * - Callback ends with "Action" (Next.js 15-friendly if passed from Server Components).
 * - Announces changes via `aria-live` for screen readers.
 * - Emits lightweight client events for analytics/debug:
 *     - "qs:billing:poll"        { paymentId, status, attempts, isPolling }
 *     - "qs:billing:done"        { paymentId, finalStatus }
 * - Shows a tiny progress bar (attempts / maxAttempts) with `role="progressbar"`.
 */
export default function UpgradeWatcher({
  paymentId,
  onDoneAction,
  showDetails = true,
}: {
  paymentId: string;
  onDoneAction?: (status: "SUCCESS" | "FAILED" | "TIMEOUT") => void | Promise<void>;
  /** Toggle verbose UI lines (defaults to true) */
  showDetails?: boolean;
}) {
  const announceRef = useRef<HTMLSpanElement | null>(null);

  // Stable helper to dispatch window events
  const emit = useCallback((name: string, detail?: unknown) => {
    // eslint-disable-next-line no-console
    console.log(`[qs:event] ${name}`, detail);
    if (typeof window !== "undefined" && "CustomEvent" in window) {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  }, []);

  const {
    status,
    isPolling,
    attempts,
    error,
  } = usePaymentStatusPoll(paymentId, {
    onSuccess: async () => {
      emit("qs:billing:done", { paymentId, finalStatus: "SUCCESS" });
      try {
        await onDoneAction?.("SUCCESS");
      } catch (e) {
        console.error("[UpgradeWatcher] onDoneAction(SUCCESS) error:", e);
      }
    },
    onFailure: async () => {
      emit("qs:billing:done", { paymentId, finalStatus: "FAILED" });
      try {
        await onDoneAction?.("FAILED");
      } catch (e) {
        console.error("[UpgradeWatcher] onDoneAction(FAILED) error:", e);
      }
    },
    // Tweakable polling strategy
    intervalMs: 2000,
    maxIntervalMs: 10000,
    maxAttempts: 60,
  });

  // Keep this in sync with the hook's maxAttempts above
  const maxAttempts = 60;

  const pct = useMemo(() => {
    const p = Math.min(100, Math.round((attempts / maxAttempts) * 100));
    return Number.isFinite(p) ? p : 0;
  }, [attempts, maxAttempts]);

  // Live announcer for status/attempts
  useEffect(() => {
    emit("qs:billing:poll", { paymentId, status, attempts, isPolling });

    const el = announceRef.current;
    if (!el) return;
    el.textContent = `Payment ${status}. ${attempts} checks.`;
    const t = setTimeout(() => {
      if (announceRef.current) announceRef.current.textContent = "";
    }, 1200);
    return () => clearTimeout(t);
  }, [attempts, emit, isPolling, paymentId, status]);

  // TIMEOUT path: when the hook stops polling with an error
  useEffect(() => {
    if (error && !isPolling) {
      emit("qs:billing:done", { paymentId, finalStatus: "TIMEOUT", error });
      (async () => {
        try {
          await onDoneAction?.("TIMEOUT");
        } catch (e) {
          console.error("[UpgradeWatcher] onDoneAction(TIMEOUT) error:", e);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, isPolling]);

  return (
    <div className="text-sm text-gray-700 dark:text-slate-200">
      {/* SR-only live announcer */}
      <span ref={announceRef} className="sr-only" aria-live="polite" />

      <div className="flex items-center gap-2">
        <StatusDot running={isPolling} status={status} />
        <div>
          Status: <span className="font-medium">{status}</span>
        </div>
      </div>

      {/* Progress */}
      <div
        className="mt-2 h-2 w-full max-w-xs overflow-hidden rounded-full border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Payment checks progress"
        title={`${attempts}/${maxAttempts}`}
      >
        <div
          className="h-full bg-[#39a0ca] dark:bg-sky-500 transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {showDetails && (
        <div className="mt-2 space-y-0.5">
          <div>
            Checks: <span className="tabular-nums">{attempts}</span> / {maxAttempts}
          </div>
          {error && (
            <div className="text-red-600 dark:text-red-400">
              Note: {String(error)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------- tiny status indicator ------------------------- */
function StatusDot({
  running,
  status,
}: {
  running: boolean;
  status: string;
}) {
  const cls = running
    ? "bg-amber-500"
    : status === "SUCCESS"
    ? "bg-emerald-500"
    : status === "FAILED"
    ? "bg-rose-500"
    : "bg-gray-400";

  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`}
      aria-hidden="true"
    />
  );
}
