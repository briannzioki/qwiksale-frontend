// src/app/account/billing/UpgradePanel.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import UpgradeWatcher from "@/components/billing/UpgradeWatcher";

type Tier = "GOLD" | "PLATINUM";
const TIER_PRICE: Record<Tier, number> = { GOLD: 199, PLATINUM: 499 };

/* ---------------------- phone helpers (Kenya) ---------------------- */
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
  return /^254(7|1)\d{8}$/.test(normalizeKePhone(input));
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

  const phoneInputRef = useRef<HTMLInputElement>(null);

  const normalized = useMemo(() => (phone ? normalizeKePhone(phone) : ""), [phone]);
  const phoneValid = useMemo(() => (phone ? isValidKePhone(phone) : false), [phone]);

  async function startUpgrade() {
    if (busy) return;
    if (!userEmail) {
      setError("You must be signed in to upgrade.");
      return;
    }
    if (!phoneValid) {
      setError("Enter a valid Kenyan M-Pesa number (e.g. 07XXXXXXXX or 2547XXXXXXXX).");
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
        // IMPORTANT: send normalized 2547XXXXXXXX
        body: JSON.stringify({ tier, phone: normalized, mode, email: userEmail }),
      });

      let json: any = null;
      try {
        json = await res.json();
      } catch {
        // fall back to text if server didn't return JSON
        const txt = await res.text().catch(() => "");
        if (!res.ok) throw new Error(txt || `Failed (${res.status})`);
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Failed (${res.status})`);
      }

      setPaymentId(json.paymentId ?? null);
      setMessage(json.message ?? "STK push sent. Confirm on your phone.");
    } catch (e: any) {
      setError(e?.message || "Could not start upgrade");
    } finally {
      setBusy(false);
    }
  }

  const panelClass =
    "mt-4 sm:mt-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-5 shadow-sm";

  const tierBtnBase =
    "rounded-2xl border p-3 sm:p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const tierBtnInactive =
    "border-[var(--border-subtle)] bg-[var(--bg)] hover:bg-[var(--bg-subtle)]";

  const tierBtnActive = "border-[var(--border)] bg-[var(--bg-elevated)] shadow-sm";

  const labelText = "text-xs sm:text-sm text-[var(--text)]";
  const labelHint = "block text-[11px] sm:text-xs text-[var(--text-muted)]";

  const inputBase =
    "mt-1 w-full rounded-xl border bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm outline-none placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const inputInvalid = "border-[var(--border)] bg-[var(--bg-subtle)]";
  const inputValid = "border-[var(--border-subtle)]";

  const selectClass =
    "mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm outline-none focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const ctaBase =
    "inline-flex min-h-9 items-center justify-center rounded-2xl border px-4 py-2 text-xs sm:text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const ctaEnabled =
    "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm hover:bg-[var(--bg-subtle)]";

  const ctaDisabled = "border-[var(--border-subtle)] opacity-60 cursor-not-allowed";

  return (
    <section className={panelClass} aria-busy={busy || undefined} aria-describedby="upgrade-status">
      {/* Tiers */}
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2" role="group" aria-label="Choose plan">
        {(["GOLD", "PLATINUM"] as Tier[]).map((t) => {
          const isActive = tier === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              aria-pressed={isActive}
              className={[tierBtnBase, isActive ? tierBtnActive : tierBtnInactive].join(" ")}
            >
              <div className="text-base sm:text-lg font-semibold text-[var(--text)]">
                {t === "GOLD" ? "Gold" : "Platinum"}
              </div>
              <div className="text-xs sm:text-sm text-[var(--text-muted)]">
                KES {TIER_PRICE[t].toLocaleString("en-KE")}
              </div>
              <ul className="mt-1.5 sm:mt-2 list-disc pl-4 text-xs sm:text-sm text-[var(--text)]">
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
            </button>
          );
        })}
      </div>

      {/* Payment inputs */}
      <div className="mt-3 sm:mt-4 grid gap-2 sm:gap-3 sm:grid-cols-2">
        <label className={labelText}>
          <span className={labelHint}>M-Pesa Number (2547XXXXXXXX)</span>
          <input
            ref={phoneInputRef}
            type="tel"
            inputMode="numeric"
            placeholder="07XXXXXXXX or 2547XXXXXXXX"
            className={[inputBase, phone && !phoneValid ? inputInvalid : inputValid].join(" ")}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={(e) => setPhone(e.target.value.trim())}
            aria-invalid={!!phone && !phoneValid}
            aria-describedby="phone-help"
            autoComplete="tel"
          />
          <div id="phone-help" className="mt-1 text-[11px] sm:text-xs text-[var(--text-muted)]">
            Will be used as <code className="font-mono">{normalized || "-"}</code>
          </div>
        </label>

        <label className={labelText}>
          <span className={labelHint}>Pay via</span>
          <select
            className={selectClass}
            value={mode}
            onChange={(e) => setMode(e.target.value as "paybill" | "till")}
          >
            <option value="paybill">Paybill</option>
            <option value="till">Buy Goods (Till)</option>
          </select>
        </label>
      </div>

      {/* CTA */}
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
          {busy ? "Starting…" : "Upgrade"}
        </button>
      </div>

      {/* Messages (ARIA live region) */}
      <p id="upgrade-status" className="sr-only" aria-live="polite">
        {busy ? "Starting upgrade…" : message || error || ""}
      </p>
      {message && <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm text-[var(--text)]">{message}</p>}
      {error && <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm text-[var(--text)]">{error}</p>}

      {/* Watcher */}
      {paymentId && (
        <div className="mt-4 sm:mt-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-2.5 sm:p-3">
          <div className="text-xs sm:text-sm text-[var(--text)]">
            Waiting for payment confirmation…
          </div>
          <div className="mt-2">
            <UpgradeWatcher
              paymentId={paymentId}
              onDoneAction={(s) => {
                setStatusDone(s);
                if (s === "SUCCESS") {
                  setMessage("Payment confirmed! Your account will reflect the new tier shortly.");
                  setError(null);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Final status */}
      {statusDone === "SUCCESS" && (
        <div className="mt-3 sm:mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-2.5 sm:p-3 text-xs sm:text-sm text-[var(--text)]">
          Payment confirmed! Your account will reflect the new tier shortly.
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
