// src/app/sentry-test/page.tsx
"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";

// Simple hint banner: show if you forgot to set a DSN
const HAS_SENTRY = Boolean(process.env["NEXT_PUBLIC_SENTRY_DSN"]);

export default function SentryTestPage() {
  const [txnStatus, setTxnStatus] = React.useState<"idle" | "running" | "ok" | "error">("idle");

  function captureMessage() {
    Sentry.addBreadcrumb({ category: "ui", message: "Clicked: Send message", level: "info" });
    Sentry.setTag("page", "sentry-test");
    Sentry.captureMessage("qwiksale: client hello (button)");
  }

  function throwSyncError() {
    Sentry.setContext("example", { foo: "bar", ts: Date.now() });
    throw new Error("qwiksale: client thrown error");
  }

  function rejectAsync() {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    Promise.reject(new Error("qwiksale: unhandled promise rejection"));
  }

  async function captureCaughtError() {
    try {
      const res = await fetch("/api/not-a-real-endpoint", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} on test endpoint`);
    } catch (err) {
      Sentry.withScope((scope) => {
        scope.setLevel("error");
        scope.setTag("page", "sentry-test");
        scope.setFingerprint(["qwiksale", "caught-error"]);
        scope.setContext("request", { path: "/api/not-a-real-endpoint" });
        Sentry.captureException(err);
      });
      alert("Captured caught error (check Sentry).");
    }
  }

  async function runTransaction() {
    setTxnStatus("running");
    try {
      // v8: use startSpan instead of startTransaction
      await Sentry.startSpan({ name: "sentry-test:demo-transaction", op: "transaction" }, async () => {
        await Sentry.startSpan({ name: "simulate work (750ms)", op: "task" }, async () => {
          await new Promise((r) => setTimeout(r, 750));
        });
      });
      setTxnStatus("ok");
    } catch {
      setTxnStatus("error");
    } finally {
      setTimeout(() => setTxnStatus("idle"), 1500);
    }
  }

  function addBreadcrumb() {
    Sentry.addBreadcrumb({
      category: "action",
      level: "info",
      message: "User pressed â€˜Add breadcrumbâ€™",
      data: { time: new Date().toISOString() },
    });
    alert("Breadcrumb added (check breadcrumb trail on subsequent events).");
  }

  function setUser() {
    Sentry.setUser({
      id: "test-user-123",
      email: "test@example.com",
      username: "sentry-demo",
    });
    alert("User context set (id/email/username).");
  }

  async function pingTunnel() {
    try {
      const res = await fetch("/monitoring", { method: "POST", body: "noop" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      alert("Tunnel reachable âœ…");
    } catch {
      alert("Tunnel blocked âŒ");
    }
  }

  return (
    <div className="container-page py-10 space-y-6">
      <div className="rounded-2xl p-6 text-white bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue shadow-soft">
        <h1 className="text-2xl font-bold">Sentry Test</h1>
        <p className="text-white/90">Trigger client events and verify they arrive in Sentry.</p>
      </div>

      {!HAS_SENTRY && (
        <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-yellow-900 text-sm">
          Sentry DSN not detected. Set <code className="font-mono">NEXT_PUBLIC_SENTRY_DSN</code> to
          enable client event delivery.
        </div>
      )}

      <div className="card p-5 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <button className="btn-gradient-primary" onClick={captureMessage}>
            Send message
          </button>

          <button className="btn-outline" onClick={throwSyncError}>
            Throw error
          </button>

          <button className="btn-outline" onClick={rejectAsync}>
            Unhandled rejection
          </button>

          <button className="btn-outline" onClick={captureCaughtError}>
            Capture caught error
          </button>

          <button className="btn-outline" onClick={runTransaction}>
            Start transaction
          </button>

          <button className="btn-outline" onClick={addBreadcrumb}>
            Add breadcrumb
          </button>

          <button className="btn-outline" onClick={setUser}>
            Set user context
          </button>

          <button className="btn-outline" onClick={pingTunnel} title="POST /monitoring">
            Ping tunnel
          </button>
        </div>

        <div className="text-sm text-gray-600 dark:text-slate-300">
          Transaction status:{" "}
          <span
            className={
              txnStatus === "ok"
                ? "text-emerald-600"
                : txnStatus === "error"
                ? "text-red-600"
                : "text-gray-600 dark:text-slate-300"
            }
          >
            {txnStatus}
          </span>
        </div>

        <p className="text-xs text-gray-500">
          In production, configure sample rates (e.g. <code>tracesSampleRate</code>) to manage
          volume. Check Network for <code className="font-mono">/monitoring</code> calls and your
          Sentry dashboard for events.
        </p>
      </div>
    </div>
  );
}
