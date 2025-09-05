"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | string;

type PollOpts = {
  /** First delay (ms) before the 1st poll. Default 1000. */
  initialDelay?: number;
  /** Base interval (ms). We’ll backoff using a factor. Default 2000. */
  intervalMs?: number;
  /** Max interval (ms) after backoff. Default 10000. */
  maxIntervalMs?: number;
  /** Multiplier for backoff. Default 1.5. */
  backoffFactor?: number;
  /** Stop polling after this many attempts (safety). Default 60 (~ couple minutes). */
  maxAttempts?: number;
  /** Optional: auto-start polling on mount if paymentId is provided. Default true. */
  autoStart?: boolean;
  /** Called when payment becomes SUCCESS. */
  onSuccess?: (payload: any) => void;
  /** Called when payment becomes FAILED. */
  onFailure?: (payload: any) => void;
};

type StatusPayload = {
  ok: boolean;
  payment?: {
    id: string;
    status: PaymentStatus;
    amount?: number | null;
    targetTier?: string | null;
    mode?: "paybill" | "till" | null;
    payerPhone?: string | null;
    merchantRequestId?: string | null;
    checkoutRequestId?: string | null;
    createdAt?: string;
    updatedAt?: string;
  };
  error?: string;
};

export function usePaymentStatusPoll(paymentId?: string | null, opts: PollOpts = {}) {
  const {
    initialDelay = 1000,
    intervalMs = 2000,
    maxIntervalMs = 10000,
    backoffFactor = 1.5,
    maxAttempts = 60,
    autoStart = true,
    onSuccess,
    onFailure,
  } = opts;

  const [status, setStatus] = useState<PaymentStatus>("PENDING");
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [payload, setPayload] = useState<StatusPayload | null>(null);

  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef(intervalMs);

  const stop = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    setIsPolling(false);
  }, []);

  const pollOnce = useCallback(async () => {
    if (!paymentId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/billing/upgrade/status?id=${encodeURIComponent(paymentId)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const json = (await res.json()) as StatusPayload;
      setPayload(json);

      if (!res.ok || !json.ok || !json.payment) {
        throw new Error(json?.error || `Status ${res.status}`);
      }

      const s = json.payment.status as PaymentStatus;
      setStatus(s);

      if (s === "SUCCESS") {
        stop();
        onSuccess?.(json);
        return;
      }
      if (s === "FAILED") {
        stop();
        onFailure?.(json);
        return;
      }

      // Still pending -> schedule next with backoff
      setAttempts((n) => n + 1);
      intervalRef.current = Math.min(Math.ceil(intervalRef.current * backoffFactor), maxIntervalMs);

      if (attempts + 1 >= maxAttempts) {
        stop();
        setError("Timed out waiting for payment confirmation.");
        return;
      }

      timerRef.current = window.setTimeout(pollOnce, intervalRef.current);
    } catch (e: any) {
      // Network/JSON/etc. Don’t stop immediately; try again with backoff unless max attempts hit
      setAttempts((n) => n + 1);
      setError(e?.message || "Polling error");
      intervalRef.current = Math.min(Math.ceil(intervalRef.current * backoffFactor), maxIntervalMs);

      if (attempts + 1 >= maxAttempts) {
        stop();
        return;
      }
      timerRef.current = window.setTimeout(pollOnce, intervalRef.current);
    }
  }, [
    paymentId,
    backoffFactor,
    maxIntervalMs,
    onFailure,
    onSuccess,
    stop,
    attempts,
  ]);

  const start = useCallback(() => {
    if (!paymentId || isPolling) return;
    setIsPolling(true);
    setError(null);
    setAttempts(0);
    intervalRef.current = intervalMs;
    timerRef.current = window.setTimeout(pollOnce, initialDelay);
  }, [paymentId, isPolling, intervalMs, initialDelay, pollOnce]);

  // Pause when tab is hidden; resume when visible (saves battery/network).
  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        stop();
      } else if (autoStart && paymentId) {
        start();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [autoStart, paymentId, start, stop]);

  // Auto-start if requested
  useEffect(() => {
    if (autoStart && paymentId) start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]); // intentionally omit start/stop to avoid re-run

  return {
    // state
    status,       // "PENDING" | "SUCCESS" | "FAILED" | ...
    isPolling,
    attempts,
    error,
    payload,
    // actions
    start,        // manually start (if autoStart=false)
    stop,         // manually stop
  };
}
