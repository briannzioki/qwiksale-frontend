"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";

/* ------------------------------------------------------------------ */
/* Config (client-safe via NEXT_PUBLIC_)                               */
/* ------------------------------------------------------------------ */

const DEFAULT_MSISDN =
  (process.env["NEXT_PUBLIC_TEST_MSISDN"] as string | undefined) || "";
const PUBLIC_ENV =
  (process.env["NEXT_PUBLIC_MPESA_ENV"] as "sandbox" | "production" | undefined) ||
  "sandbox";

const PRESETS = [10, 50, 100, 200, 500] as const;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Normalize Kenyan MSISDN to 2547XXXXXXXX or 2541XXXXXXXX. */
function normalizeMsisdn(input: string): string {
  const raw = (input || "").trim();

  // If already +2547… or +2541…, drop +
  if (/^\+254(7|1)\d{8}$/.test(raw)) return raw.replace(/^\+/, "");

  // Strip non-digits
  let s = raw.replace(/\D+/g, "");

  // 07… / 01… -> 2547… / 2541…
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^01\d{8}$/.test(s)) s = "254" + s.slice(1);

  // 7…… / 1…… -> 2547… / 2541…
  if (/^7\d{8}$/.test(s)) s = "254" + s;
  if (/^1\d{8}$/.test(s)) s = "254" + s;

  // Guard: too many digits pasted
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12);

  return s;
}
function isValidMsisdn(msisdn: string) {
  return /^254(7|1)\d{8}$/.test(msisdn);
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
function lsGet(key: string, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

type Mode = "paybill" | "till";

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function PayPage() {
  const [msisdn, setMsisdn] = useState<string>("");
  const [profileMsisdn, setProfileMsisdn] = useState<string>(""); // normalized from /api/me/profile
  const normalized = useMemo(() => normalizeMsisdn(msisdn), [msisdn]);
  const validPhone = isValidMsisdn(normalized);

  const [amount, setAmount] = useState<number>(PRESETS[0]);
  const [mode, setMode] = useState<Mode>("paybill");

  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Prefill order: profile.whatsapp -> last used (ls) -> env default
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const r = await fetch("/api/me/profile", { cache: "no-store" });
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          const wa = (j?.user?.whatsapp || "").trim();
          const norm = wa ? normalizeMsisdn(wa) : "";
          if (alive && norm && isValidMsisdn(norm)) {
            setProfileMsisdn(norm);
            setMsisdn(norm);
            return;
          }
        }
      } catch {
        /* ignore, fall back to ls/env */
      }
      // fallback to last used then env default
      const last = lsGet("qs_last_msisdn", DEFAULT_MSISDN);
      const normLast = normalizeMsisdn(last);
      if (alive && normLast) {
        setMsisdn(normLast);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Persist when valid
  useEffect(() => {
    if (validPhone) lsSet("qs_last_msisdn", normalized);
  }, [validPhone, normalized]);

  function setAmountSafe(v: string) {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    setAmount(clampInt(n, 1, 1_000_000));
  }

  // Snap-normalize on blur for a clean input value
  function snapNormalize() {
    const n = normalizeMsisdn(msisdn);
    if (n !== msisdn) setMsisdn(n);
  }

  async function pay() {
    setErr(null);
    setResp(null);

    if (!validPhone) {
      const msg = "Please enter a valid phone like 2547XXXXXXXX or 2541XXXXXXXX.";
      setErr(msg);
      toast.error("Invalid phone");
      return;
    }
    if (!(amount >= 1)) {
      const msg = "Amount must be at least KES 1.";
      setErr(msg);
      toast.error("Invalid amount");
      return;
    }

    if (loading) return; // guard double-click
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
          msisdn: normalized, // digits only
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
        const msg =
          j?.error ||
          j?.errorMessage ||
          j?.ResponseDescription ||
          `Request failed (${r.status})`;
        setErr(msg);
        toast.error(msg);
        return;
      }

      // Typical Daraja success
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

  // derived for summary card
  const summary = useMemo(() => {
    if (!resp) return null;
    return {
      responseCode:
        resp?.ResponseCode ??
        resp?.responseCode ??
        resp?.Body?.stkCallback?.ResultCode,
      responseDesc:
        resp?.ResponseDescription ??
        resp?.responseDescription ??
        resp?.CustomerMessage ??
        resp?.customerMessage ??
        resp?.Body?.stkCallback?.ResultDesc,
      merchantRequestId:
        resp?.MerchantRequestID ??
        resp?.merchantRequestId ??
        resp?.Body?.stkCallback?.MerchantRequestID,
      checkoutRequestId:
        resp?.CheckoutRequestID ??
        resp?.checkoutRequestId ??
        resp?.Body?.stkCallback?.CheckoutRequestID,
    };
  }, [resp]);

  const showUseProfile =
    !!profileMsisdn && isValidMsisdn(profileMsisdn) && profileMsisdn !== normalized;

  return (
    <div className="container-page py-6 space-y-6 max-w-2xl mx-auto">
      {/* Hero */}
      <div className="rounded-2xl p-6 text-white shadow-soft dark:shadow-none bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue">
        <h1 className="text-2xl font-bold">Test M-Pesa STK Push</h1>
        <p className="text-white/90">
          Environment: <b className="underline">{PUBLIC_ENV}</b>. Use sandbox credentials unless you’ve switched to production.
        </p>
      </div>

      {/* Form */}
      <div className="rounded-xl border bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        {/* Phone */}
        <div>
          <label className="block text-sm font-semibold mb-1">Phone (2547XXXXXXXX or 2541XXXXXXXX)</label>
          <div className="flex gap-2 items-start">
            <input
              className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-brandBlue/40 dark:border-slate-700 dark:bg-slate-950"
              placeholder="2547XXXXXXXX"
              value={msisdn}
              onChange={(e) => setMsisdn(e.target.value)}
              onBlur={snapNormalize}
              inputMode="numeric"
              aria-invalid={!validPhone}
            />
            {showUseProfile && (
              <button
                type="button"
                onClick={() => setMsisdn(profileMsisdn)}
                className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800"
                title="Use my profile phone"
              >
                Use profile
              </button>
            )}
          </div>
          <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">
            Normalized: <code className="font-mono">{normalized || "—"}</code>
          </div>
          {!validPhone && msisdn && (
            <div className="text-xs text-red-600 mt-1" role="alert" aria-live="polite">
              Must match <code className="font-mono">2547XXXXXXXX</code> or <code className="font-mono">2541XXXXXXXX</code>
            </div>
          )}
        </div>

        {/* Amount + quick chips */}
        <div>
          <label className="block text-sm font-semibold mb-1">Amount (KES)</label>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="number"
              min={1}
              step={1}
              className="w-36 rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-brandBlue/40 dark:border-slate-700 dark:bg-slate-950"
              value={amount}
              onChange={(e) => setAmountSafe(e.target.value)}
            />
            <div className="flex gap-2">
              {PRESETS.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold transition
                    ${amount === v ? "bg-brandNavy text-white border-brandNavy" : "bg-white hover:bg-gray-50 dark:bg-slate-900 dark:hover:bg-slate-800"}`}
                  onClick={() => setAmount(v)}
                >
                  {v.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mode */}
        <div>
          <label className="block text-sm font-semibold mb-1">Mode</label>
          <select
            className="w-64 rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-brandBlue/40 dark:border-slate-700 dark:bg-slate-950"
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
            className={`rounded-xl bg-[#161748] text-white px-4 py-2 font-semibold hover:opacity-95 disabled:opacity-60`}
          >
            {loading ? "Processing…" : "Send STK Push"}
          </button>
          <button
            type="button"
            className="rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800"
            onClick={() => {
              setResp(null);
              setErr(null);
            }}
            disabled={loading}
          >
            Clear
          </button>
          <a
            href="/api/mpesa/callback"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl px-4 py-2 font-semibold hover:underline text-sm"
            title="Callback health check (GET)"
          >
            Callback status
          </a>
        </div>

        {/* Error */}
        {err && (
          <div
            className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-200"
            role="alert"
            aria-live="polite"
          >
            {err}
          </div>
        )}

        {/* Parsed summary */}
        {resp && (
          <div className="rounded-xl border dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
            <h2 className="font-semibold">Response</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div>
                <span className="text-gray-500 dark:text-slate-400">Response Code:</span>{" "}
                <span className="font-medium">{String(
                  resp?.ResponseCode ??
                  resp?.responseCode ??
                  resp?.Body?.stkCallback?.ResultCode ??
                  "—")}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-slate-400">Response:</span>{" "}
                <span className="font-medium">{
                  resp?.ResponseDescription ??
                  resp?.responseDescription ??
                  resp?.CustomerMessage ??
                  resp?.customerMessage ??
                  resp?.Body?.stkCallback?.ResultDesc ??
                  "—"}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-slate-400">MerchantRequestID:</span>{" "}
                <span className="font-medium">{
                  resp?.MerchantRequestID ??
                  resp?.merchantRequestId ??
                  resp?.Body?.stkCallback?.MerchantRequestID ??
                  "—"}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-slate-400">CheckoutRequestID:</span>{" "}
                <span className="font-medium break-all">{
                  resp?.CheckoutRequestID ??
                  resp?.checkoutRequestId ??
                  resp?.Body?.stkCallback?.CheckoutRequestID ??
                  "—"}</span>
                {(resp?.CheckoutRequestID || resp?.checkoutRequestId || resp?.Body?.stkCallback?.CheckoutRequestID) && (
                  <button
                    className="ml-2 rounded-md border px-2 py-0.5 text-xs hover:bg-gray-50 dark:hover:bg-slate-800"
                    onClick={async () => {
                      try {
                        const id =
                          resp?.CheckoutRequestID ??
                          resp?.checkoutRequestId ??
                          resp?.Body?.stkCallback?.CheckoutRequestID;
                        await navigator.clipboard.writeText(String(id));
                        toast.success("CheckoutRequestID copied");
                      } catch {
                        toast.error("Couldn't copy");
                      }
                    }}
                    type="button"
                    title="Copy CheckoutRequestID"
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
          Ensure <code className="font-mono">MPESA_CALLBACK_URL</code> is publicly reachable (e.g., Vercel prod domain or an ngrok URL)
          pointing to <code className="font-mono">/api/mpesa/callback</code>. In sandbox, the default shortcode is{" "}
          <code className="font-mono">174379</code> and mode is <code className="font-mono">paybill</code>.
        </div>
      </div>
    </div>
  );
}
