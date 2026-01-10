"use client";

import { useMemo, useRef, useState } from "react";
import UpgradeWatcher from "@/components/billing/UpgradeWatcher";

type Tier = "GOLD" | "PLATINUM";
const TIER_PRICE: Record<Tier, number> = { GOLD: 199, PLATINUM: 499 };

function normalizeKePhone(raw: string): string {
  const trimmed = (raw || "").trim();
  if (/^\+254(7|1)\d{8}$/.test(trimmed)) return trimmed.replace(/^\+/, "");
  let s = trimmed.replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s) || /^01\d{8}$/.test(s)) s = "254" + s.slice(1);
  if (/^7\d{8}$/.test(s) || /^1\d{8}$/.test(s)) s = "254" + s;
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12);
  return s;
}

function isValidKePhone(input: string) {
  const n = normalizeKePhone(input);
  return /^254(7|1)\d{8}$/.test(n);
}

function SelectChevron({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M6 8l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function UpgradePanel({ userEmail }: { userEmail: string }) {
  const [tier, setTier] = useState<Tier>("GOLD");
  const [mode, setMode] = useState<"paybill" | "till">("paybill");
  const [phone, setPhone] = useState<string>("");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusDone, setStatusDone] = useState<"SUCCESS" | "FAILED" | "TIMEOUT" | null>(null);

  const phoneInputRef = useRef<HTMLInputElement | null>(null);

  const normalized = useMemo(() => (phone ? normalizeKePhone(phone) : ""), [phone]);
  const phoneValid = useMemo(() => (phone ? isValidKePhone(phone) : false), [phone]);

  async function startUpgrade() {
    if (busy) return;

    if (!userEmail) {
      setError("You must be signed in to upgrade.");
      return;
    }

    if (!phoneValid) {
      setError("Enter a valid Kenyan M-Pesa number (example 2547XXXXXXXX or 2541XXXXXXXX).");
      phoneInputRef.current?.focus();
      return;
    }

    setBusy(true);
    setError(null);
    setStatusDone(null);
    setPaymentId(null);
    setMessage("");

    try {
      const res = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "same-origin",
        body: JSON.stringify({
          tier,
          phone: normalized,
          mode,
        }),
      });

      let j: any = null;
      try {
        j = await res.json();
      } catch {
        j = null;
      }

      if (!res.ok || !j?.ok) {
        try {
          // eslint-disable-next-line no-console
          console.warn("[UpgradePanel] upgrade start failed", {
            status: res.status,
            body: j,
          });
        } catch {
          /* ignore */
        }

        setError("Could not start the payment. Please try again.");
        return;
      }

      setPaymentId(j?.paymentId ?? null);
      setMessage(j?.message ?? "STK push sent. Confirm on your phone.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const panelClass =
    "mt-4 sm:mt-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-5 shadow-sm";

  const tierBtnBase =
    "relative overflow-hidden rounded-2xl border p-3 sm:p-4 text-left transition " +
    "focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const tierBtnInactive =
    "border-[var(--border-subtle)] bg-[var(--bg)] hover:bg-[var(--bg-subtle)]";

  const tierBtnActive = "border-[var(--border)] bg-[var(--bg-elevated)] shadow-sm";

  const labelText = "text-xs sm:text-sm text-[var(--text)]";
  const labelHint = "block text-[11px] sm:text-xs text-[var(--text-muted)]";

  const inputBase =
    "mt-1 w-full rounded-xl border bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm outline-none " +
    "placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const inputInvalid = "border-[var(--border)] bg-[var(--bg-subtle)]";
  const inputValid = "border-[var(--border-subtle)]";

  const selectBase =
    "mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 pr-10 " +
    "text-sm text-[var(--text)] shadow-sm outline-none appearance-none " +
    "focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const ctaBase =
    "inline-flex min-h-9 items-center justify-center rounded-2xl border px-4 py-2 text-xs sm:text-sm font-semibold " +
    "transition focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const ctaEnabled =
    "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm hover:bg-[var(--bg-subtle)]";

  const ctaDisabled = "border-[var(--border-subtle)] opacity-60 cursor-not-allowed";

  const sectionA11yProps = busy ? ({ "aria-busy": "true" } as const) : ({} as const);

  function tierChrome(t: Tier) {
    // Subtle, token-based tint overlays (works in light + dark).
    // Uses existing CSS vars: --accent and --brand-blue (and keeps everything readable).
    const base =
      "before:pointer-events-none before:absolute before:inset-0 before:content-[''] " +
      "after:pointer-events-none after:absolute after:inset-0 after:content-['']";

    if (t === "GOLD") {
      return [
        base,
        "before:bg-[color:var(--accent)] before:opacity-[0.10]",
        "after:bg-[radial-gradient(120%_85%_at_0%_0%,rgba(255,255,255,0.20)_0%,transparent_60%)] after:opacity-80",
      ].join(" ");
    }

    return [
      base,
      "before:bg-[color:var(--brand-blue)] before:opacity-[0.10]",
      "after:bg-[radial-gradient(120%_85%_at_0%_0%,rgba(255,255,255,0.18)_0%,transparent_60%)] after:opacity-75",
    ].join(" ");
  }

  return (
    <section className={panelClass} {...sectionA11yProps} aria-describedby="upgrade-status">
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2" role="group" aria-label="Choose plan">
        {(["GOLD", "PLATINUM"] as Tier[]).map((t) => {
          const isActive = tier === t;
          const pressedProps = ({ "aria-pressed": isActive ? "true" : "false" } as const);

          return (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              className={[
                tierBtnBase,
                tierChrome(t),
                isActive ? tierBtnActive : tierBtnInactive,
              ].join(" ")}
              {...pressedProps}
            >
              <div className="relative z-10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base sm:text-lg font-semibold text-[var(--text)]">
                      {t === "GOLD" ? "Gold" : "Platinum"}
                    </div>
                    <div className="text-xs sm:text-sm text-[var(--text-muted)]">
                      KES {TIER_PRICE[t].toLocaleString("en-KE")}
                    </div>
                  </div>

                  <span
                    className={[
                      "shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold",
                      isActive
                        ? "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text-muted)]",
                    ].join(" ")}
                    aria-label={isActive ? "Selected plan" : "Plan option"}
                    title={isActive ? "Selected" : "Select"}
                  >
                    {isActive ? "Selected" : "Choose"}
                  </span>
                </div>

                <ul className="mt-2 list-disc pl-4 text-xs sm:text-sm text-[var(--text)]">
                  {t === "GOLD" ? (
                    <>
                      <li>Priority placement</li>
                      <li>Seller badge</li>
                    </>
                  ) : (
                    <>
                      <li>Top placement</li>
                      <li>Pro seller badge</li>
                    </>
                  )}
                </ul>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 sm:mt-4 grid gap-2 sm:gap-3 sm:grid-cols-2">
        <label className={labelText}>
          <span className={labelHint}>M-Pesa Number (2547XXXXXXXX)</span>
          <PhoneInput
            inputRef={phoneInputRef}
            phone={phone}
            setPhone={setPhone}
            normalized={normalized}
            phoneValid={phoneValid}
            inputBase={inputBase}
            inputInvalid={inputInvalid}
            inputValid={inputValid}
          />
        </label>

        <label className={labelText}>
          <span className={labelHint}>Pay via</span>
          <div className="relative">
            <select
              className={selectBase}
              value={mode}
              onChange={(e) => setMode(e.target.value as "paybill" | "till")}
              aria-label="Payment mode"
            >
              <option value="paybill">Paybill</option>
              <option value="till">Buy Goods (Till)</option>
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <SelectChevron />
            </span>
          </div>
          <span className="mt-1 block text-[11px] sm:text-xs text-[var(--text-muted)]">
            Choose how the STK push should be initiated.
          </span>
        </label>
      </div>

      <div className="mt-4 sm:mt-5 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs sm:text-sm text-[var(--text)]">
          Selected: <strong>{tier}</strong> - KES {TIER_PRICE[tier].toLocaleString("en-KE")}
        </div>
        <button
          type="button"
          onClick={startUpgrade}
          disabled={busy || !phoneValid}
          className={[ctaBase, busy || !phoneValid ? ctaDisabled : ctaEnabled].join(" ")}
          title={!phoneValid && phone ? "Enter a valid M-Pesa number" : "Start upgrade"}
        >
          {busy ? "Starting..." : "Upgrade"}
        </button>
      </div>

      <p id="upgrade-status" className="sr-only" aria-live="polite">
        {busy ? "Starting upgrade" : message || error || ""}
      </p>

      {message && <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm text-[var(--text)]">{message}</p>}
      {error && <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm text-[var(--text)]">{error}</p>}

      {paymentId && (
        <div className="mt-4 sm:mt-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-2.5 sm:p-3">
          <div className="text-xs sm:text-sm text-[var(--text)]">
            Waiting for payment confirmation...
          </div>
          <div className="mt-2">
            <UpgradeWatcher
              paymentId={paymentId}
              onDoneAction={(s) => {
                setStatusDone(s);
                if (s === "SUCCESS") {
                  setMessage("Payment confirmed. Your account will reflect the new tier shortly.");
                  setError(null);
                }
                if (s === "FAILED") {
                  setError("Payment failed. Please try again.");
                }
                if (s === "TIMEOUT") {
                  setError("Timed out waiting for confirmation. Check again later.");
                }
              }}
            />
          </div>
        </div>
      )}

      {statusDone === "SUCCESS" && (
        <div className="mt-3 sm:mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-2.5 sm:p-3 text-xs sm:text-sm text-[var(--text)]">
          Payment confirmed. Your account will reflect the new tier shortly.
        </div>
      )}
      {statusDone === "FAILED" && (
        <div className="mt-3 sm:mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-2.5 sm:p-3 text-xs sm:text-sm text-[var(--text)]">
          Payment failed. Please try again.
        </div>
      )}
      {statusDone === "TIMEOUT" && (
        <div className="mt-3 sm:mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-2.5 sm:p-3 text-xs sm:text-sm text-[var(--text)]">
          Timed out waiting for confirmation. You can check later in Billing.
        </div>
      )}
    </section>
  );
}

function PhoneInput({
  inputRef,
  phone,
  setPhone,
  normalized,
  phoneValid,
  inputBase,
  inputInvalid,
  inputValid,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  phone: string;
  setPhone: (v: string) => void;
  normalized: string;
  phoneValid: boolean;
  inputBase: string;
  inputInvalid: string;
  inputValid: string;
}) {
  const invalid = !!phone && !phoneValid;
  const invalidProps = invalid ? ({ "aria-invalid": "true" } as const) : ({} as const);

  return (
    <>
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        placeholder="07XXXXXXXX or 2547XXXXXXXX"
        className={[inputBase, invalid ? inputInvalid : inputValid].join(" ")}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        onBlur={(e) => setPhone(e.target.value.trim())}
        {...invalidProps}
        aria-describedby="phone-help"
        autoComplete="tel"
      />
      <div id="phone-help" className="mt-1 text-[11px] sm:text-xs text-[var(--text-muted)]">
        Will be used as <code className="font-mono">{normalized || "-"}</code>
      </div>
    </>
  );
}
