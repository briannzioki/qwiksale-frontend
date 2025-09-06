// src/app/components/DevSentryTest.tsx
"use client";

import * as Sentry from "@sentry/nextjs";
import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Dev-only Sentry playground.
 *
 * Renders only when:
 *  - Vercel env is not "production" (preview/dev), OR
 *  - NEXT_PUBLIC_SHOW_DEV_TEST is "1"
 *
 * Features:
 *  - Send client message / error
 *  - Trigger API route to test server error capture
 *  - Add breadcrumbs/tags
 *  - Simulate slow network + capture
 *  - Trigger unhandled rejection
 *  - (optional) Throw a sync error to test React error boundaries
 */
export default function DevSentryTest() {
  const ENV = process.env["VERCEL_ENV"] || process.env.NODE_ENV || "development";
  const SHOW =
    process.env["NEXT_PUBLIC_SHOW_DEV_TEST"] === "1" || ENV !== "production";

  const [status, setStatus] = useState<string>("");
  const [tagVal, setTagVal] = useState<string>("dev");
  const thrownRef = useRef(false);

  // Small helpers — keep UI snappy and safe if Sentry isn’t configured yet
  const hasSentry = !!Sentry?.captureMessage;

  const captureMsg = useCallback((msg: string, level: Sentry.SeverityLevel = "info") => {
    if (!hasSentry) return console.log("[sentry:mock:captureMessage]", msg, level);
    Sentry.captureMessage(msg, level);
  }, [hasSentry]);

  const captureErr = useCallback((e: unknown) => {
    if (!hasSentry) return console.log("[sentry:mock:captureException]", e);
    Sentry.captureException(e);
  }, [hasSentry]);

  const addBreadcrumb = useCallback((message: string, data?: Record<string, unknown>) => {
    if (!hasSentry) return console.log("[sentry:mock:addBreadcrumb]", message, data);

    const crumb: Sentry.Breadcrumb = {
      category: "devtools",
      message,
      level: "info",
    };

    // Only attach `data` when present to satisfy exactOptionalPropertyTypes
    if (data) {
      // Sentry's type is `{ [key: string]: any }`; cast is safe for dev tool payloads
      (crumb as Sentry.Breadcrumb & { data: Record<string, any> }).data = data as Record<string, any>;
    }

    Sentry.addBreadcrumb(crumb);
  }, [hasSentry]);

  const setTag = useCallback((key: string, value: string) => {
    if (!hasSentry) return console.log("[sentry:mock:setTag]", key, value);
    Sentry.setTag(key, value);
  }, [hasSentry]);

  // Actions
  const sendClientMessage = useCallback(() => {
    addBreadcrumb("clicked:client_message");
    captureMsg("qwiksale: client hello (button)", "info");
    setStatus("Client message sent ✓");
  }, [addBreadcrumb, captureMsg]);

  const sendClientError = useCallback(() => {
    addBreadcrumb("clicked:client_error");
    try {
      throw new Error("qwiksale: client error (button)");
    } catch (e) {
      captureErr(e);
      setStatus("Client error captured ✓");
    }
  }, [addBreadcrumb, captureErr]);

  const sendServerError = useCallback(async () => {
    addBreadcrumb("clicked:server_error");
    setStatus("Sending server error…");
    try {
      const r = await fetch("/api/dev/sentry-test", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as any;
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setStatus("Server error captured ✓ (check Sentry)");
    } catch (e: any) {
      setStatus(`Server test failed: ${e?.message || "unknown error"}`);
    }
  }, [addBreadcrumb]);

  const simulateSlow = useCallback(async () => {
    addBreadcrumb("clicked:slow_fetch");
    setStatus("Simulating slow fetch (2s) …");
    const t0 = performance.now?.() ?? Date.now();
    await new Promise((res) => setTimeout(res, 2000));
    const duration = (performance.now?.() ?? Date.now()) - t0;
    captureMsg("qwiksale: slow operation simulated", "warning");
    setStatus(`Slow op simulated (~${Math.round(duration)}ms) ✓`);
  }, [addBreadcrumb, captureMsg]);

  const unhandledRejection = useCallback(() => {
    addBreadcrumb("clicked:unhandled_rejection");
    setStatus("Triggering unhandled rejection… (check console/Sentry)");
    // Deliberately create an unhandled rejection
    void Promise.reject(new Error("qwiksale: unhandled rejection (dev test)"));
  }, [addBreadcrumb]);

  const throwSyncError = useCallback(() => {
    if (thrownRef.current) return;
    const ok = window.confirm(
      "This will throw a synchronous error to test error boundaries. Proceed?"
    );
    if (!ok) return;
    addBreadcrumb("clicked:throw_sync_error");
    thrownRef.current = true;
    // This will crash the nearest error boundary in dev
    throw new Error("qwiksale: thrown sync error (dev test)");
  }, [addBreadcrumb]);

  const corner = useMemo(
    () =>
      "fixed z-[9999] bottom-3 right-3 max-w.[92vw] rounded-xl border bg-white/90 text-gray-900 shadow " +
      "dark:bg-slate-900/90 dark:text-slate-100 dark:border-slate-700 backdrop-blur px-3 py-2",
    []
  );

  if (!SHOW) return null;

  return (
    <div className={corner}>
      <div className="text-[11px] font-semibold mb-1 flex items-center gap-2">
        <span>Dev Tools · Sentry</span>
        <span className="opacity-70">({ENV})</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={sendClientMessage} className="btn-ghost px-2 py-1 text-xs">
          Client message
        </button>
        <button onClick={sendClientError} className="btn-ghost px-2 py-1 text-xs">
          Client error
        </button>
        <button onClick={sendServerError} className="btn-ghost px-2 py-1 text-xs">
          Server error
        </button>
        <button onClick={simulateSlow} className="btn-ghost px-2 py-1 text-xs">
          Simulate slow
        </button>
        <button onClick={unhandledRejection} className="btn-ghost px-2 py-1 text-xs">
          Unhandled rejection
        </button>
        <button onClick={throwSyncError} className="btn-ghost px-2 py-1 text-xs">
          Throw sync error
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-[11px] opacity-80">
          Tag:
          <input
            value={tagVal}
            onChange={(e) => setTagVal(e.target.value)}
            className="ml-1 rounded border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-1 py-[1px] text-[11px]"
            placeholder="value"
          />
        </label>
        <button
          onClick={() => {
            setTag("qs-dev", tagVal || "dev");
            setStatus(`Set tag "qs-dev"=${JSON.stringify(tagVal || "dev")} ✓`);
          }}
          className="btn-ghost px-2 py-1 text-[11px]"
        >
          Set tag
        </button>
        <button
          onClick={() => {
            addBreadcrumb("devtools:manual_breadcrumb", { tag: tagVal || "dev" });
            setStatus("Breadcrumb added ✓");
          }}
          className="btn-ghost px-2 py-1 text-[11px]"
        >
          Add breadcrumb
        </button>
      </div>

      {status ? <div className="mt-1 text-[11px] opacity-80">{status}</div> : null}
      {!hasSentry && (
        <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
          Sentry SDK not initialized — using mock console logging.
        </div>
      )}
    </div>
  );
}
