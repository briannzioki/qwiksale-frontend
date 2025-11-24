"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePaymentStatusPoll } from "@/app/hooks/usePaymentStatusPoll";

/**
 * Watches an upgrade/payment status and reports progress.
 *
 * - Passive: never performs navigation or router.refresh().
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
  showDetails?: boolean;
}) {
  const announceRef = useRef<HTMLSpanElement | null>(null);

  const emit = useCallback((name: string, detail?: unknown) => {
    // eslint-disable-next-line no-console
    console.log(`[qs:event] ${name}`, detail);
    if (typeof window !== "undefined" && "CustomEvent" in window) {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  }, []);

  const { status, isPolling, attempts, error } = usePaymentStatusPoll(paymentId, {
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
    intervalMs: 2000,
    maxIntervalMs: 10000,
    maxAttempts: 60,
  });

  const maxAttempts = 60;

  const pct = useMemo(() => {
    const p = Math.min(100, Math.round((attempts / maxAttempts) * 100));
    return Number.isFinite(p) ? p : 0;
  }, [attempts, maxAttempts]);

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

  // TIMEOUT path (still passive)
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
  }, [emit, error, isPolling, onDoneAction, paymentId]);

  return (
    <div className="text-sm text-muted-foreground">
      <span ref={announceRef} className="sr-only" aria-live="polite" />

      <div className="flex items-center gap-2">
        <StatusDot running={isPolling} status={status} />
        <div>
          Status: <span className="font-medium">{status}</span>
        </div>
      </div>

      <div
        className="mt-2 h-2 w-full max-w-xs overflow-hidden rounded-full border border-border bg-muted/60"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Payment checks progress"
        title={`${attempts}/${maxAttempts}`}
      >
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: "currentColor" }}
        />
      </div>

      {showDetails && (
        <div className="mt-2 space-y-0.5">
          <div>
            Checks: <span className="tabular-nums">{attempts}</span> /{" "}
            {maxAttempts}
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

function StatusDot({ running, status }: { running: boolean; status: string }) {
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
