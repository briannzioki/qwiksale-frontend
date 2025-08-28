// src/app/donate/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";

/** Normalize various phone formats to 2547XXXXXXXX */
function normalizeMsisdn(input: string): string {
  let s = (input || "").replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^\+2547\d{8}$/.test(s)) s = s.replace(/^\+/, "");
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12);
  return s;
}

const PRESETS = [200, 500, 1000] as const;

export default function DonatePage() {
  const [amount, setAmount] = useState<number | "">("");
  const [activePreset, setActivePreset] = useState<number | null>(PRESETS[0]);
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Prefill from public env (sandbox testing) or localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("qs_last_msisdn") || "";
      if (saved) {
        setPhone(saved);
        return;
      }
    } catch {}
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - allowed in the client for public envs
    const test = typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_TEST_MSISDN as string | undefined) : undefined;
    if (test) setPhone(test);
  }, []);

  // When a preset is selected, keep amount synced; when custom is active, amount is free-form
  useEffect(() => {
    if (activePreset) setAmount(activePreset);
  }, [activePreset]);

  const canSubmit = useMemo(() => {
    const msisdn = normalizeMsisdn(phone);
    const n = typeof amount === "number" ? amount : Number.NaN;
    return /^2547\d{8}$/.test(msisdn) && Number.isFinite(n) && n >= 1 && !submitting;
  }, [phone, amount, submitting]);

  async function donate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatus("");

    const msisdn = normalizeMsisdn(phone);
    // Guard again at submit
    if (!/^2547\d{8}$/.test(msisdn)) {
      setError("Please enter a valid phone like 2547XXXXXXXX.");
      return;
    }
    const amt = typeof amount === "number" ? Math.round(amount) : 0;
    if (!Number.isFinite(amt) || amt < 1) {
      setError("Please enter a valid amount (minimum 1 KES).");
      return;
    }

    // Save last good number locally
    try {
      localStorage.setItem("qs_last_msisdn", msisdn);
    } catch {}

    if (submitting) return;
    setSubmitting(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      setStatus("Starting M-Pesa STK push… check your phone.");
      const res = await fetch("/api/mpesa/stk-initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        // Your existing route will set AccountReference/TransactionDesc internally.
        body: JSON.stringify({ amount: amt, msisdn, mode: "paybill" }),
      });
      const data = await res.json().catch(() => ({} as any));

      if (res.ok) {
        // Daraja success is ResponseCode === "0"
        const ok = data?.ResponseCode === "0" || data?.CustomerMessage || data?.CheckoutRequestID;
        if (ok) {
          setStatus(data?.CustomerMessage || "STK push sent. Approve the request on your phone.");
          toast.success("STK push sent ✨");
        } else {
          setStatus("Request sent. Check your phone.");
        }
      } else {
        const msg =
          data?.errorMessage ||
          data?.CustomerMessage ||
          data?.ResponseDescription ||
          data?.error ||
          `Failed to start payment (HTTP ${res.status}).`;
        setError(msg);
        toast.error("Failed to initiate donation");
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setError("Network error. Please try again.");
        toast.error("Network error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      {/* Header card */}
      <div className="rounded-xl p-5 text-white bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue shadow">
        <h1 className="text-2xl font-bold">Support QwikSale</h1>
        <p className="text-white/90">
          Your donation helps us keep the marketplace fast, safe, and ad-free.
        </p>
      </div>

      {/* Body */}
      <form onSubmit={donate} className="mt-6 space-y-5 bg-white rounded-xl p-5 border">
        <p className="text-gray-700">
          We’re a neutral mediator — sellers handle their own sales. Donations help us provide dispute
          support, fight spam, and improve the platform.
        </p>

        {/* Presets */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((v) => {
              const active = activePreset === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setActivePreset(v);
                    setAmount(v);
                  }}
                  className={`rounded-lg px-4 py-2 border font-semibold transition
                    ${active ? "bg-brandNavy text-white border-brandNavy" : "bg-white hover:bg-gray-50"}
                  `}
                >
                  KES {v.toLocaleString()}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setActivePreset(null)}
              className={`rounded-lg px-4 py-2 border font-semibold transition
                ${activePreset === null ? "bg-brandNavy text-white border-brandNavy" : "bg-white hover:bg-gray-50"}
              `}
            >
              Custom
            </button>
          </div>

          {/* Custom input */}
          {activePreset === null && (
            <div className="mt-3">
              <input
                type="number"
                min={1}
                step={1}
                className="w-40 rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brandBlue"
                placeholder="KES"
                value={amount === "" ? "" : amount}
                onChange={(e) => setAmount(e.target.value === "" ? "" : Math.max(1, Math.floor(Number(e.target.value))))}
              />
            </div>
          )}
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Phone (2547XXXXXXXX)</label>
          <input
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brandBlue"
            placeholder="2547XXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            We’ll send a one-time STK push to this number.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className={`rounded-lg px-5 py-3 text-white font-semibold shadow transition
              ${canSubmit ? "bg-brandNavy hover:opacity-90" : "bg-gray-300 cursor-not-allowed"}
            `}
          >
            {submitting ? "Processing…" : "Donate via M-Pesa"}
          </button>
          <button
            type="button"
            onClick={() => {
              setActivePreset(PRESETS[0]);
              setAmount(PRESETS[0]);
            }}
            className="rounded-lg border px-5 py-3 font-semibold hover:bg-gray-50"
          >
            Reset
          </button>
        </div>

        {status && <div className="text-sm text-gray-700">{status}</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="text-xs text-gray-500">
          After you approve on your phone, we’ll receive a confirmation. If anything looks stuck,
          try again — callbacks can take a moment.
        </div>
      </form>
    </div>
  );
}

