"use client";

import { useState } from "react";
import UpgradeWatcher from "@/components/billing/UpgradeWatcher";

type Tier = "GOLD" | "PLATINUM";
const TIER_PRICE: Record<Tier, number> = { GOLD: 199, PLATINUM: 499 };

export default function UpgradePanel({ userEmail }: { userEmail: string }) {
  const [tier, setTier] = useState<Tier>("GOLD");
  const [mode, setMode] = useState<"paybill" | "till">("paybill");
  const [phone, setPhone] = useState<string>(""); // 2547XXXXXXXX
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusDone, setStatusDone] = useState<"SUCCESS" | "FAILED" | "TIMEOUT" | null>(null);

  async function startUpgrade() {
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
        body: JSON.stringify({ tier, phone, mode }),
      });
      const json = await res.json().catch(() => ({}));
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

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 p-5 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setTier("GOLD")}
          className={`rounded-2xl border p-4 text-left ${
            tier === "GOLD" ? "border-gray-900" : "border-gray-300"
          }`}
        >
          <div className="text-lg font-semibold">Gold</div>
          <div className="text-sm text-gray-600">KES {TIER_PRICE.GOLD}</div>
          <ul className="mt-2 list-disc pl-4 text-sm text-gray-700">
            <li>Priority placement</li>
            <li>Seller badge</li>
          </ul>
        </button>

        <button
          type="button"
          onClick={() => setTier("PLATINUM")}
          className={`rounded-2xl border p-4 text-left ${
            tier === "PLATINUM" ? "border-gray-900" : "border-gray-300"
          }`}
        >
          <div className="text-lg font-semibold">Platinum</div>
          <div className="text-sm text-gray-600">KES {TIER_PRICE.PLATINUM}</div>
          <ul className="mt-2 list-disc pl-4 text-sm text-gray-700">
            <li>Top placement</li>
            <li>Pro seller badge</li>
          </ul>
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="block text-gray-600">M-Pesa Number (2547XXXXXXXX)</span>
          <input
            type="tel"
            inputMode="numeric"
            placeholder="2547XXXXXXXX"
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-gray-300"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>

        <label className="text-sm">
          <span className="block text-gray-600">Pay via</span>
          <select
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-gray-300"
            value={mode}
            onChange={(e) => setMode(e.target.value as "paybill" | "till")}
          >
            <option value="paybill">Paybill</option>
            <option value="till">Buy Goods (Till)</option>
          </select>
        </label>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <div className="text-sm text-gray-700">
          Selected: <strong>{tier}</strong> — KES {TIER_PRICE[tier]}
        </div>
        <button
          type="button"
          onClick={startUpgrade}
          disabled={busy || !phone}
          className={`rounded-2xl px-4 py-2 text-white ${
            busy || !phone ? "bg-gray-400" : "bg-gray-900 hover:bg-gray-800"
          }`}
        >
          {busy ? "Starting…" : "Upgrade"}
        </button>
      </div>

      {message && <p className="mt-3 text-sm text-green-700">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {paymentId && (
        <div className="mt-5 rounded-xl border border-blue-200 p-3">
          <div className="text-sm text-blue-800">
            Waiting for payment confirmation…
          </div>
          <div className="mt-2">
            <UpgradeWatcher
              paymentId={paymentId}
              onDone={(s) => {
                setStatusDone(s);
                if (s === "SUCCESS") {
                  // Optionally, refresh user data or redirect
                  // location.reload(); // or router.refresh() if used in a layout
                }
              }}
            />
          </div>
        </div>
      )}

      {statusDone === "SUCCESS" && (
        <div className="mt-4 rounded-xl bg-green-50 p-3 text-green-800">
          Payment confirmed! Your account will reflect the new tier shortly.
        </div>
      )}
      {statusDone === "FAILED" && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-red-800">
          Payment failed. Please try again.
        </div>
      )}
      {statusDone === "TIMEOUT" && (
        <div className="mt-4 rounded-xl bg-yellow-50 p-3 text-yellow-800">
          Timed out waiting for confirmation. You can check later in Billing.
        </div>
      )}
    </section>
  );
}
