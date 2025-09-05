"use client";

import { useEffect } from "react";
import { usePaymentStatusPoll } from "@/app/hooks/usePaymentStatusPoll";

export default function UpgradeWatcher({
  paymentId,
  onDone,
}: {
  paymentId: string;
  onDone?: (status: "SUCCESS" | "FAILED" | "TIMEOUT") => void;
}) {
  const { status, isPolling, attempts, error } = usePaymentStatusPoll(paymentId, {
    onSuccess: () => onDone?.("SUCCESS"),
    onFailure: () => onDone?.("FAILED"),
    // You can tune these:
    intervalMs: 2000,
    maxIntervalMs: 10000,
    maxAttempts: 60,
  });

  useEffect(() => {
    if (error && !isPolling) {
      onDone?.("TIMEOUT");
    }
  }, [error, isPolling, onDone]);

  return (
    <div className="text-sm text-gray-700">
      <div>Status: <span className="font-medium">{status}</span></div>
      <div>Checks: {attempts}</div>
      {error && <div className="text-red-600">Note: {error}</div>}
    </div>
  );
}
