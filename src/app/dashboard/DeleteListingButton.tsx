// src/app/dashboard/DeleteListingButton.tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type Props = {
  productId: string;
  /** Optional: show a friendlier confirm like “Delete ‘MacBook Pro’?” */
  productName?: string;
  /** Optional: parent can optimistically remove the card, etc. */
  onDeletedAction?: () => void; // ⬅️ renamed to satisfy Next 15 rule
  /** Optional: how long user must hold to confirm (ms). Default 1000. */
  holdMs?: number;
};

export default function DeleteListingButton({
  productId,
  productName,
  onDeletedAction,
  holdMs = 1000,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  // --- Long-press state ---
  const [progress, setProgress] = useState(0); // 0..1
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const holdingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function beginHold() {
    if (busy || pending) return;
    holdingRef.current = true;
    startRef.current = performance.now();

    const step = (now: number) => {
      if (!holdingRef.current) return;
      const elapsed = now - (startRef.current ?? now);
      const p = Math.min(1, elapsed / holdMs);
      setProgress(p);
      if (p >= 1) {
        holdingRef.current = false;
        setProgress(0);
        void actuallyDelete();
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
  }

  function cancelHold() {
    holdingRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    setProgress(0);
  }

  async function fallbackConfirmAndDelete() {
    if (busy || pending) return;
    const label = productName ? `“${productName}”` : "this listing";
    const ok = window.confirm(`Delete ${label}? This cannot be undone.`);
    if (!ok) return;
    await actuallyDelete();
  }

  async function actuallyDelete() {
    if (busy || pending) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/products/${encodeURIComponent(productId)}`, {
        method: "DELETE",
      });

      if (r.status === 401) {
        toast.error("Please sign in to delete listings.");
        const cb = encodeURIComponent("/dashboard");
        window.location.href = `/signin?callbackUrl=${cb}`;
        return;
      }

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);

      // Optimistic parent update (optional)
      onDeletedAction?.();

      toast.success("Listing deleted.");
      startTransition(() => router.refresh());
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || pending;

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        disabled={disabled}
        onMouseDown={beginHold}
        onTouchStart={beginHold}
        onMouseUp={cancelHold}
        onMouseLeave={cancelHold}
        onTouchEnd={cancelHold}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void fallbackConfirmAndDelete();
          }
        }}
        onClick={(e) => {
          if (progress === 0 && !holdingRef.current) {
            e.preventDefault();
            void fallbackConfirmAndDelete();
          }
        }}
        className={`relative overflow-hidden rounded-md border px-2 py-1 text-sm font-medium transition
          ${disabled ? "opacity-60" : "hover:bg-red-50"}
          border-red-200 text-red-700 dark:border-red-900/40 dark:hover:bg-red-900/20`}
        aria-disabled={disabled}
        aria-live="polite"
        title="Delete listing"
      >
        <span
          className="pointer-events-none absolute inset-0 bg-red-500/10"
          style={{ transform: `scaleX(${progress})`, transformOrigin: "left" }}
        />
        <span className="relative z-10 flex items-center gap-1">
          <span aria-hidden>🗑️</span>
          {disabled ? "Deleting…" : progress > 0 ? "Hold…" : "Delete"}
        </span>
      </button>

      <span className="ml-2 hidden text-xs text-gray-500 sm:inline">
        Tip: press & hold to confirm
      </span>
    </div>
  );
}
