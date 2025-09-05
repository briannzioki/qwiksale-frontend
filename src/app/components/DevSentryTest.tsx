// src/app/components/DevSentryTest.tsx
"use client";

import * as Sentry from "@sentry/nextjs";
import { useCallback, useMemo, useState } from "react";

/**
 * Renders only when:
 *  - Vercel env is not "production"  (preview/dev), OR
 *  - NEXT_PUBLIC_SHOW_DEV_TEST is "1"
 */
export default function DevSentryTest() {
  const ENV = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
  const SHOW =
    process.env.NEXT_PUBLIC_SHOW_DEV_TEST === "1" || ENV !== "production";

  const [status, setStatus] = useState<string>("");

  const sendClientMessage = useCallback(() => {
    Sentry.captureMessage("qwiksale: client hello (button)");
    setStatus("Client message sent ✓");
  }, []);

  const sendClientError = useCallback(() => {
    try {
      throw new Error("qwiksale: client error (button)");
    } catch (e) {
      Sentry.captureException(e);
      setStatus("Client error captured ✓");
    }
  }, []);

  const sendServerError = useCallback(async () => {
    setStatus("Sending server error…");
    try {
      const r = await fetch("/api/dev/sentry-test", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setStatus("Server error captured ✓");
    } catch (e: any) {
      setStatus(`Server test failed: ${e?.message || "unknown error"}`);
    }
  }, []);

  const corner = useMemo(
    () =>
      "fixed z-[9999] bottom-3 right-3 max-w-[90vw] rounded-xl border bg-white/90 text-gray-900 shadow " +
      "dark:bg-slate-900/90 dark:text-slate-100 dark:border-slate-700 backdrop-blur px-3 py-2",
    []
  );

  if (!SHOW) return null;

  return (
    <div className={corner}>
      <div className="text-xs font-semibold mb-1">Dev Tools · Sentry</div>
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
      </div>
      {status ? <div className="mt-1 text-[11px] opacity-80">{status}</div> : null}
    </div>
  );
}
