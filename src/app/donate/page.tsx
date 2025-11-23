// src/app/donate/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { normalizeKenyanPhone } from "@/app/lib/phone";

/* --------------------------- Helpers & Types --------------------------- */

/** KES formatter (no decimals) */
const fmtKES = (n: number) =>
  `KES ${new Intl.NumberFormat("en-KE", {
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.floor(n)))}`;

/** Preset donation amounts */
const PRESETS = [200, 500, 1000, 2500] as const;

/** Upper bound to prevent fat-finger inputs */
const MAX_DONATION = 1_000_000;

/* ------------------------------- Page -------------------------------- */

export default function DonatePage() {
  const [amount, setAmount] = useState<number | "">("");
  const [activePreset, setActivePreset] = useState<number | null>(PRESETS[0]);
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Prefill phone from localStorage or test env var
  useEffect(() => {
    try {
      const saved = localStorage.getItem("qs_last_msisdn") || "";
      if (saved) {
        setPhone(saved);
        return;
      }
    } catch {
      /* ignore */
    }
    const test =
      typeof process !== "undefined"
        ? (process.env["NEXT_PUBLIC_TEST_MSISDN"] as string | undefined)
        : undefined;
    if (test) setPhone(test);
  }, []);

  // Keep amount in sync with preset selection
  useEffect(() => {
    if (activePreset !== null) setAmount(activePreset);
  }, [activePreset]);

  // Derived “can submit”
  const canSubmit = useMemo(() => {
    const msisdn = normalizeKenyanPhone(phone) || "";
    const n = typeof amount === "number" ? amount : Number.NaN;
    return (
      /^254(7|1)\d{8}$/.test(msisdn) &&
      Number.isFinite(n) &&
      n >= 1 &&
      n <= MAX_DONATION &&
      !submitting
    );
  }, [phone, amount, submitting]);

  // Safely set custom amount
  function setCustomAmount(raw: string) {
    if (raw === "") {
      setAmount("");
      return;
    }
    const cleaned = Math.max(
      1,
      Math.min(MAX_DONATION, Math.floor(Number(raw) || 0)),
    );
    setAmount(cleaned);
  }

  async function donate(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setError("");
    setStatus("");

    const msisdn = normalizeKenyanPhone(phone) || "";
    if (!/^254(7|1)\d{8}$/.test(msisdn)) {
      setError(
        "Enter a valid Safaricom number like 2547XXXXXXXX or 2541XXXXXXXX.",
      );
      return;
    }
    const amt = typeof amount === "number" ? Math.round(amount) : 0;
    if (!Number.isFinite(amt) || amt < 1) {
      setError("Enter a valid amount (minimum 1 KES).");
      return;
    }

    // Persist last valid number
    try {
      localStorage.setItem("qs_last_msisdn", msisdn);
    } catch {
      /* ignore */
    }

    // Abort any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setSubmitting(true);
    setStatus("Starting M-Pesa STK push… check your phone.");
    try {
      const res = await fetch("/api/mpesa/stk-initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          amount: amt,
          msisdn,
          mode: "paybill",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const ok =
          data?.ResponseCode === "0" ||
          !!data?.CheckoutRequestID ||
          !!data?.CustomerMessage;

        if (ok) {
          const msg =
            data?.CustomerMessage ||
            "STK push sent. Approve on your phone to complete the donation.";
          setStatus(msg);
          toast.success("STK push sent ✨");

          try {
            // @ts-ignore — optional analytics
            window.plausible?.("Donation Initiated", {
              props: { amount: amt },
            });
          } catch {
            /* ignore */
          }
        } else {
          setStatus(
            "Request sent. If you didn’t receive a prompt, please try again.",
          );
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
    <div className="mx-auto max-w-xl p-6">
      {/* Header */}
      <section className="rounded-2xl bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue p-6 text-white shadow-sm">
        <h1 className="text-2xl font-extrabold md:text-3xl">
          Support QwikSale
        </h1>
        <p className="mt-1 text-white/90">
          Your donation keeps the marketplace fast, safe, and ad-free.
        </p>
      </section>

      {/* Form */}
      <form
        onSubmit={donate}
        className="mt-6 rounded-2xl border border-border bg-card p-5 text-foreground shadow-sm"
      >
        <p className="text-foreground">
          We’re a neutral mediator — sellers handle their own sales. Donations
          help us tackle spam, improve trust &amp; safety, and build new
          features for everyone.
        </p>

        {/* Amount presets */}
        <div className="mt-5">
          <label className="mb-2 block text-sm font-semibold text-foreground">
            Amount
          </label>
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
                  className={`rounded-xl border px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 ${
                    active
                      ? "border-brandNavy bg-brandNavy text-white ring-brandNavy/40"
                      : "border-border bg-card text-foreground hover:bg-muted"
                  }`}
                  aria-pressed={active}
                >
                  {fmtKES(v)}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setActivePreset(null)}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 ${
                activePreset === null
                  ? "border-brandNavy bg-brandNavy text-white ring-brandNavy/40"
                  : "border-border bg-card text-foreground hover:bg-muted"
              }`}
              aria-pressed={activePreset === null}
            >
              Custom
            </button>
          </div>

          {/* Custom amount */}
          {activePreset === null && (
            <div className="mt-3 flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={MAX_DONATION}
                step={1}
                inputMode="numeric"
                className="w-48 rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brandBlue"
                placeholder="Enter KES amount"
                value={amount === "" ? "" : amount}
                onChange={(e) => setCustomAmount(e.target.value)}
                aria-describedby="amountHelp"
              />
              {typeof amount === "number" && amount > 0 && (
                <span className="text-sm text-muted-foreground">
                  {fmtKES(amount)}
                </span>
              )}
            </div>
          )}
          <p
            id="amountHelp"
            className="mt-1 text-xs text-muted-foreground"
          >
            Minimum 1 KES. Max {fmtKES(MAX_DONATION)}.
          </p>
        </div>

        {/* Phone number */}
        <div className="mt-5">
          <label
            htmlFor="donation-phone"
            className="block text-sm font-semibold text-foreground"
          >
            Phone (Safaricom) — format{" "}
            <span className="font-mono">2547/2541XXXXXXXX</span>
          </label>
          <input
            id="donation-phone"
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brandBlue"
            placeholder="2547XXXXXXXX or 2541XXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            aria-describedby="phoneHelp"
          />
          <p
            id="phoneHelp"
            className="mt-1 text-xs text-muted-foreground"
          >
            We’ll send a one-time STK push to this number.
          </p>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className={`rounded-xl px-5 py-3 font-semibold shadow transition focus:outline-none focus:ring-2 ${
              canSubmit
                ? "bg-brandNavy text-white hover:opacity-90 ring-brandNavy/40"
                : "cursor-not-allowed bg-muted text-muted-foreground ring-transparent"
            }`}
          >
            {submitting ? "Processing…" : "Donate via M-Pesa"}
          </button>
          <button
            type="button"
            onClick={() => {
              setActivePreset(PRESETS[0]);
              setAmount(PRESETS[0]);
              setError("");
              setStatus("");
            }}
            className="rounded-xl border border-border bg-background px-5 py-3 font-semibold hover:bg-muted"
          >
            Reset
          </button>
          {submitting && (
            <button
              type="button"
              onClick={() => {
                abortRef.current?.abort();
                setSubmitting(false);
                setStatus("Cancelled.");
              }}
              className="ml-auto rounded-xl border border-border bg-background px-4 py-2 text-sm hover:bg-muted"
              title="Cancel request"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Status & errors */}
        <div className="mt-4 space-y-2">
          {status && (
            <div
              className="text-sm text-foreground"
              role="status"
              aria-live="polite"
            >
              {status}
            </div>
          )}
          {error && (
            <div
              className="text-sm text-red-600 dark:text-red-400"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </div>
          )}
        </div>

        <div className="mt-4 text-[12px] text-muted-foreground">
          After you approve on your phone, we’ll receive a confirmation. If
          anything looks stuck, try again. Questions?{" "}
          <a className="underline" href="/help">
            Contact support
          </a>
          .
        </div>
      </form>
    </div>
  );
}
