// app/pay/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";

// Build-time injected (safe on client only with NEXT_PUBLIC_)
const DEFAULT_MSISDN =
  (process.env.NEXT_PUBLIC_TEST_MSISDN as string | undefined) || "";

// ----- helpers -----
function normalizeMsisdn(input: string): string {
  let s = (input || "").replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1); // 07 -> 2547
  if (/^\+2547\d{8}$/.test(s)) s = s.replace(/^\+/, ""); // +2547 -> 2547
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12); // trim paste
  return s;
}
function isValidMsisdn(msisdn: string) {
  return /^2547\d{8}$/.test(msisdn);
}
function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(n)));
}
function prettyJson(x: unknown) {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

type Mode = "paybill" | "till";

export default function PayPage() {
  const [msisdn, setMsisdn] = useState(DEFAULT_MSISDN);
  const normalized = useMemo(() => normalizeMsisdn(msisdn), [msisdn]);
  const validPhone = isValidMsisdn(normalized);

  const [amount, setAmount] = useState<number>(1);
  const [mode, setMode] = useState<Mode>("paybill");
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep default from env if user clears and refocuses
  useEffect(() => {
    if (!msisdn && DEFAULT_MSISDN) setMsisdn(DEFAULT_MSISDN);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setAmountSafe(v: string) {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    setAmount(clampInt(n, 1, 1_000_000));
  }

  async function pay() {
    setErr(null);
    setResp(null);

    if (!validPhone) {
      setErr("Please enter a valid phone like 2547XXXXXXXX.");
      toast.error("Invalid phone");
      return;
    }
    if (!(amount >= 1)) {
      setErr("Amount must be at least KES 1.");
      toast.error("Invalid amount");
      return;
    }

    setLoading(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const r = await fetch("/api/mpesa/stk-initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          amount,
          msisdn: normalized,
          mode,
        }),
      });

      let j: any = null;
      try {
        j = await r.json();
      } catch {
        j = { error: `Non-JSON response (${r.status})` };
      }

      setResp(j);

      if (!r.ok) {
        const msg = j?.error || j?.errorMessage || `Request failed (${r.status})`;
        setErr(msg);
        toast.error(msg);
        return;
      }

      // Daraja typical success: ResponseCode === "0"
      const code = String(j?.ResponseCode ?? j?.responseCode ?? "");
      if (code === "0") {
        toast.success("STK push sent. Check your phone!");
      } else {
        toast("Request accepted — check your phone", { icon: "📲" });
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        const msg = e?.message || "Network error";
        setErr(msg);
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  // Derived fields for nice summary
  const summary = useMemo(() => {
    if (!resp) return null;
    return {
      responseCode:
        resp?.ResponseCode ?? resp?.responseCode ?? resp?.Body?.stkCallback?.ResultCode,
      responseDesc:
        resp?.ResponseDescription ??
        resp?.responseDescription ??
        resp?.CustomerMessage ??
        resp?.customerMessage ??
        resp?.Body?.stkCallback?.ResultDesc,
      merchantRequestId:
        resp?.MerchantRequestID ?? resp?.merchantRequestId ?? resp?.Body?.stkCallback?.MerchantRequestID,
      checkoutRequestId:
        resp?.CheckoutRequestID ?? resp?.checkoutRequestId ?? resp?.Body?.stkCallback?.CheckoutRequestID,
    };
  }, [resp]);

  return (
    <div className="container-page py-6 space-y-6 max-w-2xl mx-auto">
      {/* Hero */}
      <div className="rounded-2xl p-6 text-white shadow-soft dark:shadow-none bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue">
        <h1 className="text-2xl font-bold">Test M-Pesa STK Push</h1>
        <p className="text-white/90">
          Sends an STK prompt to your phone. Use sandbox credentials unless you’ve
          switched to production.
        </p>
      </div>

      {/* Form */}
      <div className="card p-5 space-y-4">
        {/* Phone */}
        <div>
          <label className="label">Phone (2547XXXXXXXX)</label>
          <input
            className="input"
            placeholder="2547XXXXXXXX"
            value={msisdn}
            onChange={(e) => setMsisdn(e.target.value)}
            inputMode="numeric"
            aria-invalid={!validPhone}
          />
          <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">
            Normalized: <code className="font-mono">{normalized || "—"}</code>
          </div>
          {!validPhone && msisdn && (
            <div className="text-xs text-red-600 mt-1">
              Must match <code className="font-mono">2547XXXXXXXX</code>
            </div>
          )}
        </div>

        {/* Amount + quick chips */}
        <div>
          <label className="label">Amount (KES)</label>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              step={1}
              className="input"
              value={amount}
              onChange={(e) => setAmountSafe(e.target.value)}
            />
            <div className="flex gap-2">
              {[10, 50, 100, 200].map((v) => (
                <button
                  key={v}
                  type="button"
                  className="btn-ghost px-3 py-2 text-sm"
                  onClick={() => setAmount(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mode */}
        <div>
          <label className="label">Mode</label>
          <select
            className="select"
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
          >
            <option value="paybill">Paybill (CustomerPayBillOnline)</option>
            <option value="till">Till / Buy Goods (CustomerBuyGoodsOnline)</option>
          </select>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={pay}
            disabled={loading || !validPhone || amount < 1}
            className={`btn-primary ${(!validPhone || amount < 1) && "opacity-60"}`}
          >
            {loading ? "Processing…" : "Send STK Push"}
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              setResp(null);
              setErr(null);
            }}
          >
            Clear
          </button>
          <a
            href="/api/mpesa/callback"
            target="_blank"
            rel="noreferrer"
            className="btn-ghost"
            title="Callback health check (GET)"
          >
            Callback status
          </a>
        </div>

        {/* Error */}
        {err && (
          <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-200">
            {err}
          </div>
        )}

        {/* Parsed summary */}
        {summary && (
          <div className="rounded-xl border dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
            <h2 className="font-semibold">Response</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div>
                <span className="text-gray-500 dark:text-slate-400">Response Code:</span>{" "}
                <span className="font-medium">{String(summary.responseCode ?? "—")}</span>
              </div>
              <div className="sm:col-span-1">
                <span className="text-gray-500 dark:text-slate-400">Response:</span>{" "}
                <span className="font-medium">{summary.responseDesc ?? "—"}</span>
              </div>
              <div className="sm:col-span-1">
                <span className="text-gray-500 dark:text-slate-400">MerchantRequestID:</span>{" "}
                <span className="font-medium">{summary.merchantRequestId ?? "—"}</span>
              </div>
              <div className="sm:col-span-1">
                <span className="text-gray-500 dark:text-slate-400">CheckoutRequestID:</span>{" "}
                <span className="font-medium break-all">{summary.checkoutRequestId ?? "—"}</span>
                {summary.checkoutRequestId && (
                  <button
                    className="ml-2 btn-ghost px-2 py-0.5 text-xs"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(summary.checkoutRequestId as string);
                        toast.success("CheckoutRequestID copied");
                      } catch {
                        toast.error("Couldn't copy");
                      }
                    }}
                  >
                    Copy
                  </button>
                )}
              </div>
            </div>

            {/* Raw JSON */}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-gray-600 dark:text-slate-300">
                Raw response JSON
              </summary>
              <pre className="text-xs bg-gray-100 dark:bg-slate-800/50 p-3 rounded mt-2 overflow-x-auto">
                {prettyJson(resp)}
              </pre>
            </details>
          </div>
        )}

        {/* Tips */}
        <div className="text-xs text-gray-600 dark:text-slate-400">
          Tip: ensure your <code className="font-mono">MPESA_CALLBACK_URL</code> is a public URL
          (e.g., ngrok) that points to <code className="font-mono">/api/mpesa/callback</code>.
        </div>
      </div>
    </div>
  );
}
