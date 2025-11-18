"use client";
// src/app/settings/billing/page.tsx

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import toast from "react-hot-toast";

/* ------------------------------------------------------------------ */
/* Constants & helpers                                                */
/* ------------------------------------------------------------------ */

type TierKey = "GOLD" | "PLATINUM";

// Visible price points (KES). Adjust anytime.
const PRICES: Record<TierKey, number> = {
  GOLD: 199,
  PLATINUM: 499,
};

const TEST_MSISDN = (process.env["NEXT_PUBLIC_TEST_MSISDN"] || "").trim();

function normalizeMsisdn(input: string): string {
  let s = (input || "").replace(/\D+/g, "");
  if (/^07\d{8}$/.test(s)) s = "254" + s.slice(1); // 07xxxxxxxx -> 2547xxxxxxxx
  if (/^\+2547\d{8}$/.test(s)) s = s.replace(/^\+/, "");
  if (s.startsWith("254") && s.length > 12) s = s.slice(0, 12);
  return s;
}

function validMsisdn(s: string) {
  return /^2547\d{8}$/.test(s);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function BillingPage() {
  const { data: session, status: sessionStatus } = useSession();

  const [tier, setTier] = useState<TierKey>("GOLD");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const price = useMemo(() => PRICES[tier], [tier]);

  // Prefill from localStorage or NEXT_PUBLIC_TEST_MSISDN
  useEffect(() => {
    try {
      const saved = localStorage.getItem("billing:lastPhone") || "";
      if (saved) {
        setPhone(saved);
      } else if (TEST_MSISDN) {
        setPhone(TEST_MSISDN);
      }
    } catch {
      if (TEST_MSISDN) setPhone(TEST_MSISDN);
    }
  }, []);

  // Persist phone locally
  useEffect(() => {
    try {
      if (phone) localStorage.setItem("billing:lastPhone", phone);
    } catch {
      /* ignore */
    }
  }, [phone]);

  // Prevent memory leaks (abort in-flight on unmount)
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatus("");

    const msisdn = normalizeMsisdn(phone);

    if (!validMsisdn(msisdn)) {
      setError("Please enter a valid Kenyan number like 2547XXXXXXXX.");
      return;
    }
    if (!session?.user?.email) {
      setError("Please sign in to upgrade your subscription.");
      return;
    }

    if (submitting) return; // double-submit guard
    setSubmitting(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      setStatus("Starting STK push… check your phone.");
      const res = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({ tier, phone: msisdn, amount: price }),
      });

      const data = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        const msg = data?.error || `Failed to start payment (${res.status})`;
        setError(msg);
        toast.error(msg);
        return;
      }

      const msg =
        data?.customerMessage ||
        data?.ResponseDescription ||
        "STK push sent. Confirm the payment on your phone.";
      setStatus(msg);
      toast.success("STK push sent");

      // Poll /api/me for subscription change → exponential-ish backoff (max ~50s)
      const targetTier: TierKey = tier;
      let updated = false;
      for (let i = 0; i < 8; i++) {
        await sleep(i === 0 ? 3000 : Math.min(5000 + i * 3000, 10000));
        const r = await fetch("/api/me", { cache: "no-store" }).catch(() => null);
        const j = (await r?.json().catch(() => ({}))) as any;
        const sub = j?.user?.subscription as TierKey | undefined;
        if (sub === targetTier) {
          updated = true;
          break;
        }
      }
      if (updated) {
        toast.success(`You're now on ${targetTier} 🎉`);
        setStatus(`Subscription upgraded to ${targetTier}. Enjoy your perks!`);
      } else {
        setStatus(
          "Payment is processing. If your tier doesn’t update shortly, refresh this page.",
        );
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setError("Network error. Please try again.");
        toast.error("Network error. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const signedIn = !!session?.user;
  const currentTier = (session?.user as any)?.subscription as
    | "FREE"
    | "GOLD"
    | "PLATINUM"
    | undefined;

  return (
    <div className="container-page py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-balance">
            Upgrade subscription
          </h1>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            Secure M-Pesa STK push. Choose a tier below and confirm on your
            phone.
          </p>
        </header>

        {/* Session card */}
        <section className="card p-4 flex items-center justify-between gap-4">
          <div className="text-sm">
            {signedIn ? (
              <>
                <div>
                  Signed in as{" "}
                  <span className="font-medium">{session?.user?.email}</span>
                </div>
                {currentTier && (
                  <div className="mt-0.5">
                    Current tier:{" "}
                    <span className="font-medium">{currentTier}</span>
                  </div>
                )}
              </>
            ) : sessionStatus === "loading" ? (
              <div className="skeleton h-4 w-56 rounded" />
            ) : (
              <div className="text-gray-600 dark:text-slate-400">
                Not signed in.
              </div>
            )}
          </div>

          {!signedIn && (
            <button
              onClick={() =>
                signIn(undefined, { callbackUrl: "/settings/billing" })
              }
              className="btn-gradient-primary"
            >
              Sign in
            </button>
          )}
        </section>

        {/* Plans */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PlanCard
            title="Gold"
            price={PRICES.GOLD}
            features={["Verified badge", "Priority placement", "Basic support"]}
            selected={tier === "GOLD"}
            onSelect={() => setTier("GOLD")}
          />
          <PlanCard
            title="Platinum"
            price={PRICES.PLATINUM}
            features={[
              "Verified badge",
              "Top placement",
              "Priority support",
              "Early access features",
            ]}
            highlighted
            selected={tier === "PLATINUM"}
            onSelect={() => setTier("PLATINUM")}
          />
        </section>

        {/* Payment form */}
        <form onSubmit={submit} className="card p-5 space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="phone" className="label">
                Phone (2547XXXXXXXX)
              </label>
              <input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="2547XXXXXXXX"
                inputMode="numeric"
                autoComplete="tel"
                className="input"
                required
                aria-invalid={
                  phone ? !validMsisdn(normalizeMsisdn(phone)) : undefined
                }
              />
              <div className="text-xs text-gray-500 dark:text-slate-400">
                We’ll send an STK push to this number. Use{" "}
                <code className="font-mono">2547XXXXXXXX</code> format.
              </div>
              {TEST_MSISDN ? (
                <button
                  type="button"
                  onClick={() => setPhone(TEST_MSISDN)}
                  className="btn-outline w-fit mt-1 text-xs"
                  title="Use test number from env"
                >
                  Use test number ({TEST_MSISDN})
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <label htmlFor="tier" className="label">
                Tier
              </label>
              <select
                id="tier"
                value={tier}
                onChange={(e) => setTier(e.target.value as TierKey)}
                className="select w-56"
              >
                <option value="GOLD">
                  Gold — KES {PRICES.GOLD.toLocaleString()}
                </option>
                <option value="PLATINUM">
                  Platinum — KES {PRICES.PLATINUM.toLocaleString()}
                </option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              className="btn-gradient-primary"
              type="submit"
              disabled={submitting || !signedIn}
              title={!signedIn ? "Please sign in first" : "Upgrade"}
            >
              {submitting
                ? "Processing…"
                : `Upgrade to ${tier} · KES ${price.toLocaleString()}`}
            </button>

            <button
              type="button"
              onClick={() => setShowAdvanced((s) => !s)}
              className="btn-outline"
            >
              {showAdvanced ? "Hide" : "Details"}
            </button>

            <p className="text-xs text-gray-500 dark:text-slate-400">
              You’ll be redirected only if sign-in is required. Payments are
              handled securely by Safaricom (Daraja).
            </p>
          </div>

          {/* Status + errors */}
          {showAdvanced && (
            <div className="mt-2 rounded-lg bg-gray-50 dark:bg-slate-800/60 p-3 text-xs text-gray-600 dark:text-slate-300">
              <ul className="list-disc ml-5 space-y-1">
                <li>
                  We send{" "}
                  <span className="font-mono">CustomerPayBillOnline</span> STK
                  to your number.
                </li>
                <li>
                  On success, our callback updates your subscription
                  automatically.
                </li>
                <li>
                  If it doesn’t update immediately, refresh — callbacks can
                  take a few seconds.
                </li>
              </ul>
            </div>
          )}

          {status && (
            <div className="text-sm text-gray-700 dark:text-slate-200">
              {status}
            </div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Subcomponents                                                      */
/* ------------------------------------------------------------------ */

function PlanCard({
  title,
  price,
  features,
  highlighted = false,
  selected = false,
  onSelect,
}: {
  title: "Gold" | "Platinum" | string;
  price: number;
  features: string[];
  highlighted?: boolean;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={[
        "card p-5 flex flex-col gap-3 transition",
        highlighted ? "ring-1 ring-brandBlue/30" : "",
        selected ? "outline outline-2 outline-brandBlue/60" : "",
      ].join(" ")}
      role="group"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <div className="text-2xl font-bold mt-1">
            KES {price.toLocaleString()}
            <span className="text-sm font-normal text-gray-500 dark:text-slate-400">
              {" "}
              / month
            </span>
          </div>
        </div>
        {selected ? (
          <span className="badge-verified" aria-label="Selected plan">
            Selected
          </span>
        ) : (
          <span className="badge bg-white dark:bg-slate-900 border text-xs">
            {features.length} perks
          </span>
        )}
      </div>

      <ul className="mt-1 space-y-2 text-sm text-gray-700 dark:text-slate-200">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <CheckIcon />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3">
        <button
          type="button"
          onClick={onSelect}
          className={selected ? "btn-outline" : "btn-gradient-primary"}
          aria-pressed={selected}
        >
          {selected ? "Selected" : "Choose plan"}
        </button>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 text-brandGreen"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 0 1 0 1.414l-7.25 7.25a1 1 0 0 1-1.414 0l-3-3a1 1 0 1 1 1.414-1.414l2.293 2.293 6.543-6.543a1 1 0 0 1 1.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}
