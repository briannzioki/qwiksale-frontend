"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { normalizeKenyanPhone } from "@/app/lib/phone";
import { cx, pillClass, pillGroupClass } from "@/app/components/ui/pill";

/* --------------------------- Helpers & Types --------------------------- */

const IS_PROD = process.env.NODE_ENV === "production";

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

    if (!IS_PROD) {
      const test =
        typeof process !== "undefined"
          ? (process.env["NEXT_PUBLIC_TEST_MSISDN"] as string | undefined)
          : undefined;
      if (test) setPhone(test);
    }
  }, []);

  useEffect(() => {
    if (activePreset !== null) setAmount(activePreset);
  }, [activePreset]);

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
      setError("Enter a valid number like 2547XXXXXXXX or 2541XXXXXXXX.");
      return;
    }
    const amt = typeof amount === "number" ? Math.round(amount) : 0;
    if (!Number.isFinite(amt) || amt < 1) {
      setError("Enter a valid amount (minimum 1 KES).");
      return;
    }

    try {
      localStorage.setItem("qs_last_msisdn", msisdn);
    } catch {
      /* ignore */
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setSubmitting(true);
    setStatus("Starting STK push. Check your phone.");

    try {
      const res = await fetch("/api/mpesa/stk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          amount: amt,
          msisdn,
          mode: "paybill",
          accountRef: "DONATE",
          description: "Donation",
        }),
      });

      const data = await res.json().catch(() => ({}));

      const ok = res.ok && (data?.ok === true || data?.ok === undefined);

      if (!ok) {
        setError("Payment initiation failed. Please try again.");
        toast.error("Payment initiation failed");
        return;
      }

      const msg =
        data?.message ||
        data?.mpesa?.CustomerMessage ||
        "STK push sent. Approve on your phone to complete the donation.";

      setStatus(String(msg));
      toast.success("STK push sent");

      try {
        // @ts-ignore optional analytics
        window.plausible?.("Donation Initiated", {
          props: { amount: amt },
        });
      } catch {
        /* ignore */
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

  const panelClass =
    "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-soft";

  const labelClass = "block text-sm font-semibold text-[var(--text)]";

  const helpClass = "mt-1 text-xs text-[var(--text-muted)]";

  const inputClass =
    "mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] shadow-sm placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const primaryBtnBase =
    "min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-semibold shadow-soft transition active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:px-5 sm:py-3 sm:text-base";

  const primaryBtnEnabled =
    "border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text)] hover:bg-[var(--bg-elevated)]";

  const primaryBtnDisabled =
    "cursor-not-allowed border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-muted)] opacity-70";

  const secondaryBtn =
    "min-h-[44px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] shadow-sm transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:px-5 sm:py-3 sm:text-base";

  const smallBtn =
    "min-h-[44px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-4 py-2 text-sm font-semibold text-[var(--text)] shadow-sm transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus";

  return (
    <div className="container-page max-w-xl py-4 sm:py-6">
      <section
        className={cx(
          "rounded-2xl px-4 py-6 text-white shadow-soft sm:px-6 sm:py-8",
          "border border-[var(--border-subtle)]",
          "bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]",
        )}
      >
        <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl md:text-3xl">
          Support QwikSale
        </h1>
        <p className="mt-1 text-xs text-white/80 sm:text-sm">
          Your donation keeps the marketplace fast, safe, and ad-free.
        </p>
      </section>

      <form
        onSubmit={donate}
        className={cx("mt-4 p-2.5 sm:mt-6 sm:p-5", panelClass)}
      >
        <p className="text-sm leading-relaxed text-[var(--text-muted)]">
          Donations help us tackle spam, improve trust and safety, and build new
          features for everyone.
        </p>

        <div className="mt-4">
          <label className={cx("mb-1", labelClass)}>Amount</label>

          <div
            className={pillGroupClass(
              "flex gap-2 overflow-x-auto whitespace-nowrap [-webkit-overflow-scrolling:touch] pb-1 sm:flex-wrap sm:overflow-visible sm:whitespace-normal",
            )}
          >
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
                  className={pillClass({ active, size: "md" })}
                  aria-pressed={active ? "true" : "false"}
                >
                  {fmtKES(v)}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setActivePreset(null)}
              className={pillClass({
                active: activePreset === null,
                size: "md",
              })}
              aria-pressed={activePreset === null ? "true" : "false"}
            >
              Custom
            </button>
          </div>

          {activePreset === null && (
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <input
                type="number"
                min={1}
                max={MAX_DONATION}
                step={1}
                inputMode="numeric"
                className={cx(
                  "w-40 min-[420px]:w-48",
                  "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)]",
                  "px-3 py-2 text-[var(--text)] shadow-sm",
                  "placeholder:text-[var(--text-muted)]",
                  "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                )}
                placeholder="Enter KES amount"
                value={amount === "" ? "" : amount}
                onChange={(e) => setCustomAmount(e.target.value)}
                aria-describedby="amountHelp"
              />
              {typeof amount === "number" && amount > 0 && (
                <span className="text-sm font-semibold text-[var(--text)]">
                  {fmtKES(amount)}
                </span>
              )}
            </div>
          )}

          <p id="amountHelp" className={helpClass}>
            Minimum 1 KES. Max {fmtKES(MAX_DONATION)}.
          </p>
        </div>

        <div className="mt-4">
          <label htmlFor="donation-phone" className={labelClass}>
            Phone (2547XXXXXXXX or 2541XXXXXXXX)
          </label>
          <input
            id="donation-phone"
            inputMode="numeric"
            className={inputClass}
            placeholder="2547XXXXXXXX or 2541XXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            aria-describedby="phoneHelp"
          />
          <p id="phoneHelp" className={helpClass}>
            We will send an STK push to this number.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className={cx(
              primaryBtnBase,
              canSubmit ? primaryBtnEnabled : primaryBtnDisabled,
            )}
          >
            {submitting ? "Processing..." : "Donate via M-Pesa"}
          </button>

          <button
            type="button"
            onClick={() => {
              setActivePreset(PRESETS[0]);
              setAmount(PRESETS[0]);
              setError("");
              setStatus("");
            }}
            className={secondaryBtn}
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
              className={cx("ml-auto", smallBtn)}
              title="Cancel request"
            >
              Cancel
            </button>
          )}
        </div>

        <div className="mt-3 space-y-2">
          {status && (
            <div
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm"
              role="status"
              aria-live="polite"
            >
              {status}
            </div>
          )}
          {error && (
            <div
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm font-semibold text-[var(--text)] shadow-sm"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </div>
          )}
        </div>

        <div className="mt-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
          After you approve on your phone, we will receive a confirmation. If it
          looks stuck, try again. Questions?{" "}
          <a
            className="underline underline-offset-4 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 ring-focus"
            href="/help"
          >
            Contact support
          </a>
          .
        </div>
      </form>
    </div>
  );
}
