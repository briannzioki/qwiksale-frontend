"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | string;

export type StatusPayload = {
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

type PollOpts = {
  /** First delay (ms) before the 1st poll. Default 1000. */
  initialDelay?: number;
  /** Base interval (ms). Default 2000. */
  intervalMs?: number;
  /** Max interval (ms). Default 10000. */
  maxIntervalMs?: number;
  /** Multiplier for backoff. Default 1.5. */
  backoffFactor?: number;
  /** Jitter percentage (0–1). Default 0.15 (±15%). */
  jitterPct?: number;
  /** Stop polling after this many attempts. Default 60. */
  maxAttempts?: number;
  /** Auto-start on mount if paymentId is provided. Default true. */
  autoStart?: boolean;
  /** Called when payment becomes SUCCESS. */
  onSuccess?: (payload: StatusPayload) => void;
  /** Called when payment becomes FAILED. */
  onFailure?: (payload: StatusPayload) => void;
  /** Called when max attempts reached without terminal status. */
  onTimeout?: (lastPayload: StatusPayload | null) => void;
  /** Called on every successful status read (including PENDING). */
  onUpdate?: (payload: StatusPayload) => void;
  /** Override status endpoint. Default: `/api/billing/upgrade/status?id=...` */
  statusUrlBuilder?: (paymentId: string) => string;
};

export function usePaymentStatusPoll(paymentId?: string | null, opts: PollOpts = {}) {
  const {
    initialDelay = 1000,
    intervalMs = 2000,
    maxIntervalMs = 10000,
    backoffFactor = 1.5,
    jitterPct = 0.15,
    maxAttempts = 60,
    autoStart = true,
    onSuccess,
    onFailure,
    onTimeout,
    onUpdate,
    statusUrlBuilder = (id) => `/api/billing/upgrade/status?id=${encodeURIComponent(id)}`,
  } = opts;

  const [status, setStatus] = useState<PaymentStatus>("PENDING");
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<StatusPayload | null>(null);

  // Refs to avoid stale closures
  const attemptsRef = useRef(0);
  const intervalRef = useRef(intervalMs);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const pollingRef = useRef(false); // single-flight guard

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const stop = useCallback(() => {
    clearTimer();
    abortRef.current?.abort();
    abortRef.current = null;
    pollingRef.current = false;
    if (mountedRef.current) setIsPolling(false);
  }, []);

  // Jittered backoff
  const nextIntervalWithJitter = useCallback(() => {
    const base = Math.min(Math.ceil(intervalRef.current * backoffFactor), maxIntervalMs);
    const jitter = Math.max(0, Math.min(1, jitterPct)) * base;
    const min = Math.max(0, base - jitter);
    const max = base + jitter;
    const withJitter = Math.floor(min + Math.random() * (max - min));
    intervalRef.current = withJitter;
    return withJitter;
  }, [backoffFactor, maxIntervalMs, jitterPct]);

  const schedule = useCallback((ms: number, fn: () => void) => {
    clearTimer();
    if (typeof window === "undefined" || !mountedRef.current) return;
    timerRef.current = setTimeout(fn, Math.max(0, ms));
  }, []);

  const pollOnce = useCallback(async () => {
    if (!paymentId || !mountedRef.current) return;
    if (pollingRef.current) return;
    pollingRef.current = true;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const url = statusUrlBuilder(paymentId);
      const res = await fetch(url, {
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      // Handle empty 204 quickly using res.ok semantics (and keep polling)
      if (res.status === 204) {
        if (!mountedRef.current) return;
        const json: StatusPayload = { ok: res.ok };
        setPayload(json);
        attemptsRef.current += 1;
        if (attemptsRef.current >= maxAttempts) {
          setError("Timed out waiting for payment confirmation.");
          stop();
          onTimeout?.(json);
          return;
        }
        const delay = nextIntervalWithJitter();
        schedule(delay, pollOnce);
        return;
      }

      // Parse JSON (tolerate non-JSON)
      let json: StatusPayload = { ok: res.ok };
      try {
        const text = await res.text();
        json = text ? (JSON.parse(text) as StatusPayload) : ({ ok: res.ok } as StatusPayload);
      } catch {
        json = { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` } as StatusPayload;
      }

      if (!mountedRef.current) return;

      setPayload(json);

      if (!res.ok || !json?.ok || !json.payment) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }

      const s = (json.payment.status ?? "PENDING") as PaymentStatus;
      setStatus(s);
      setError(null);
      onUpdate?.(json);

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

      // still pending
      attemptsRef.current += 1;
      if (attemptsRef.current >= maxAttempts) {
        setError("Timed out waiting for payment confirmation.");
        stop();
        onTimeout?.(json ?? null);
        return;
      }
      const delay = nextIntervalWithJitter();
      schedule(delay, pollOnce);
    } catch (e: any) {
      if (!mountedRef.current) return;
      attemptsRef.current += 1;
      setError(e?.message || "Polling error");
      if (attemptsRef.current >= maxAttempts) {
        stop();
        onTimeout?.(payload);
        return;
      }
      const delay = nextIntervalWithJitter();
      schedule(delay, pollOnce);
    } finally {
      pollingRef.current = false;
    }
  }, [
    paymentId,
    statusUrlBuilder,
    maxAttempts,
    nextIntervalWithJitter,
    schedule,
    stop,
    onSuccess,
    onFailure,
    onUpdate,
    onTimeout,
    payload,
  ]);

  const start = useCallback(
    (immediate = false) => {
      if (!paymentId || isPolling) return;
      // reset run state
      attemptsRef.current = 0;
      intervalRef.current = intervalMs;
      setStatus("PENDING");
      setError(null);
      setIsPolling(true);

      schedule(immediate ? 0 : initialDelay, pollOnce);
    },
    [paymentId, isPolling, intervalMs, initialDelay, pollOnce, schedule]
  );

  // mount/unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stop();
    };
  }, [stop]);

  // Pause when tab hidden; resume when visible (respect autoStart)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else if (autoStart && paymentId) {
        start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [autoStart, paymentId, start, stop]);

  // Auto-start on id changes
  useEffect(() => {
    if (autoStart && paymentId) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]);

  return {
    // state
    status,
    isPolling,
    attempts: attemptsRef.current,
    error,
    payload,
    // actions
    start,   // start(true) to poll immediately
    stop,
  };
}
