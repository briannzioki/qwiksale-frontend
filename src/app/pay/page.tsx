// src/app/pay/page.tsx
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
  const [profileMsisdn, setProfileMsisdn] = useState<string>(""); // normalized from /api/me/profile (only when requested)
  const normalized = useMemo(() => normalizeMsisdn(msisdn), [msisdn]);
  const validPhone = isValidMsisdn(normalized);

  const [amount, setAmount] = useState<number>(PRESETS[0]);
  const [mode, setMode] = useState<Mode>("paybill");

  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [resp, setResp] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const heroClass =
    "rounded-2xl bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white shadow-soft";

  // phone-first: tighter padding, restore on sm+
  const panelClass =
    "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3.5 shadow-soft sm:p-5";

  const labelClass = "mb-1 block text-sm font-semibold text-[var(--text)]";

  const helpTextClass = "mt-1 text-xs leading-relaxed text-[var(--text-muted)]";

  const inputClass =
    "w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const selectClass =
    "rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus";

  // phone-first: slightly tighter pills, keep touch target
  const pillButtonBase =
    "inline-flex min-h-9 items-center justify-center rounded-xl border px-2.5 py-2 text-xs font-semibold transition active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:px-3 sm:text-sm";

  // Prefill order: last used (ls) -> env default
  useEffect(() => {
    const last = lsGet("qs_last_msisdn", DEFAULT_MSISDN);
    const normLast = normalizeMsisdn(last);
    if (normLast) setMsisdn(normLast);
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

  async function loadPhoneFromProfile() {
    if (loadingProfile) return;
    setLoadingProfile(true);
    try {
      const r = await fetch("/api/me/profile", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });

      if (r.status === 401) {
        toast.error("Sign in to load your profile phone.");
        return;
      }
      if (!r.ok) {
        toast.error("Could not load profile.");
        return;
      }

      const j = await r.json().catch(() => ({}));
      const wa = String(j?.user?.whatsapp || "").trim();
      const norm = wa ? normalizeMsisdn(wa) : "";

      if (!norm || !isValidMsisdn(norm)) {
        toast.error("No valid WhatsApp number found in your profile.");
        return;
      }

      setProfileMsisdn(norm);
      setMsisdn(norm);
      toast.success("Loaded phone from profile");
    } catch {
      toast.error("Network error loading profile");
    } finally {
      setLoadingProfile(false);
    }
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
        toast("Request accepted - check your phone", { icon: "📲" });
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

  const showUseProfile =
    !!profileMsisdn &&
    isValidMsisdn(profileMsisdn) &&
    profileMsisdn !== normalized;

  return (
    <div className="container-page mx-auto max-w-2xl space-y-4 bg-[var(--bg)] py-4 sm:space-y-6 sm:py-6">
      {/* Hero */}
      <div className={heroClass}>
        <div className="container-page py-6 text-white sm:py-8">
          <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
            Test M-Pesa STK Push
          </h1>
          <p className="mt-1 text-sm text-white/80">
            Environment: <b className="underline">{PUBLIC_ENV}</b>. Use sandbox
            credentials unless you’ve switched to production.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className={`${panelClass} space-y-4`}>
        {/* Phone */}
        <div>
          <label htmlFor="pay-phone" className={labelClass}>
            Phone (2547XXXXXXXX or 2541XXXXXXXX)
          </label>

          <div className="flex items-start gap-2">
            <input
              id="pay-phone"
              className={inputClass}
              placeholder="2547XXXXXXXX"
              value={msisdn}
              onChange={(e) => setMsisdn(e.target.value)}
              onBlur={snapNormalize}
              inputMode="numeric"
              aria-invalid={!validPhone}
            />

            {showUseProfile ? (
              <button
                type="button"
                onClick={() => setMsisdn(profileMsisdn)}
                className={`${pillButtonBase} shrink-0 border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]`}
                title="Use my profile phone"
                disabled={loading || loadingProfile}
              >
                Use profile
              </button>
            ) : (
              <button
                type="button"
                onClick={loadPhoneFromProfile}
                className={`${pillButtonBase} shrink-0 border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)] disabled:opacity-60`}
                title="Load phone from my profile"
                disabled={loading || loadingProfile}
              >
                {loadingProfile ? "Loading…" : "Load profile"}
              </button>
            )}
          </div>

          <div className={helpTextClass}>
            Normalized:{" "}
            <code className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-0.5 font-mono text-[11px] text-[var(--text)]">
              {normalized || "-"}
            </code>
          </div>

          {!validPhone && msisdn && (
            <div
              className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-xs leading-relaxed text-[var(--text)]"
              role="alert"
              aria-live="polite"
            >
              Must match{" "}
              <code className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg)] px-2 py-0.5 font-mono text-[11px]">
                2547XXXXXXXX
              </code>{" "}
              or{" "}
              <code className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg)] px-2 py-0.5 font-mono text-[11px]">
                2541XXXXXXXX
              </code>
              .
            </div>
          )}
        </div>

        {/* Amount + quick chips */}
        <div>
          <label htmlFor="pay-amount" className={labelClass}>
            Amount (KES)
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <input
              id="pay-amount"
              type="number"
              min={1}
              step={1}
              className={`${inputClass} w-32 sm:w-36`}
              value={amount}
              onChange={(e) => setAmountSafe(e.target.value)}
            />

            {/* xs: horizontal scroll strip, sm+: wraps normally */}
            <div className="flex w-full gap-2 overflow-x-auto whitespace-nowrap [-webkit-overflow-scrolling:touch] sm:w-auto sm:flex-wrap sm:overflow-visible sm:whitespace-normal">
              {PRESETS.map((v) => {
                const isActive = amount === v;
                return (
                  <button
                    key={v}
                    type="button"
                    className={`${pillButtonBase} shrink-0 ${
                      isActive
                        ? "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
                    }`}
                    onClick={() => setAmount(v)}
                  >
                    {v.toLocaleString()}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Mode */}
        <div>
          <label htmlFor="pay-mode" className={labelClass}>
            Mode
          </label>
          <select
            id="pay-mode"
            className={`${selectClass} w-full sm:w-64`}
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
          >
            <option value="paybill">Paybill (CustomerPayBillOnline)</option>
            <option value="till">
              Till / Buy Goods (CustomerBuyGoodsOnline)
            </option>
          </select>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={pay}
            disabled={loading || !validPhone || amount < 1}
            className="btn-gradient-primary text-xs sm:text-sm disabled:pointer-events-none disabled:opacity-60"
          >
            {loading ? "Processing…" : "Send STK Push"}
          </button>

          <button
            type="button"
            className="btn-outline text-xs sm:text-sm"
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
            className="btn-outline text-xs sm:text-sm"
            title="Callback health check (GET)"
          >
            Callback status
          </a>
        </div>

        {/* Error */}
        {err && (
          <div
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-3 text-sm leading-relaxed text-[var(--text)]"
            role="alert"
            aria-live="polite"
          >
            {err}
          </div>
        )}

        {/* Parsed summary */}
        {resp && (
          <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3.5 sm:p-4">
            <h2 className="text-sm font-semibold text-[var(--text)]">Response</h2>

            <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div>
                <span className="text-[var(--text-muted)]">Response Code:</span>{" "}
                <span className="font-medium text-[var(--text)]">
                  {String(
                    resp?.ResponseCode ??
                      resp?.responseCode ??
                      resp?.Body?.stkCallback?.ResultCode ??
                      "-",
                  )}
                </span>
              </div>

              <div>
                <span className="text-[var(--text-muted)]">Response:</span>{" "}
                <span className="font-medium text-[var(--text)]">
                  {resp?.ResponseDescription ??
                    resp?.responseDescription ??
                    resp?.CustomerMessage ??
                    resp?.customerMessage ??
                    resp?.Body?.stkCallback?.ResultDesc ??
                    "-"}
                </span>
              </div>

              <div>
                <span className="text-[var(--text-muted)]">
                  MerchantRequestID:
                </span>{" "}
                <span className="font-medium text-[var(--text)]">
                  {resp?.MerchantRequestID ??
                    resp?.merchantRequestId ??
                    resp?.Body?.stkCallback?.MerchantRequestID ??
                    "-"}
                </span>
              </div>

              <div>
                <span className="text-[var(--text-muted)]">
                  CheckoutRequestID:
                </span>{" "}
                <span className="break-all font-medium text-[var(--text)]">
                  {resp?.CheckoutRequestID ??
                    resp?.checkoutRequestId ??
                    resp?.Body?.stkCallback?.CheckoutRequestID ??
                    "-"}
                </span>

                {(resp?.CheckoutRequestID ||
                  resp?.checkoutRequestId ||
                  resp?.Body?.stkCallback?.CheckoutRequestID) && (
                  <button
                    className={`${pillButtonBase} ml-2 border-[var(--border-subtle)] bg-[var(--bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)] sm:text-xs`}
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
            <details className="mt-2 sm:mt-3">
              <summary className="cursor-pointer text-sm text-[var(--text-muted)]">
                Raw response JSON
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text)]">
                {prettyJson(resp)}
              </pre>
            </details>
          </div>
        )}

        {/* Tips */}
        <div className="text-xs leading-relaxed text-[var(--text-muted)]">
          Ensure <code className="font-mono">MPESA_CALLBACK_URL</code> is publicly
          reachable (e.g., Vercel prod domain or an ngrok URL) pointing to{" "}
          <code className="font-mono">/api/mpesa/callback</code>. In sandbox, the
          default shortcode is <code className="font-mono">174379</code> and mode
          is <code className="font-mono">paybill</code>.
        </div>
      </div>
    </div>
  );
}
