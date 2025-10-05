// src/app/dashboard/DeleteListingButton.tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type Kind = "product" | "service";

type Props = {
  /** Generic id (preferred). If omitted, falls back to productId/serviceId. */
  id?: string;
  /** Back-compat: product id (still supported). */
  productId?: string;
  /** For service edit pages. */
  serviceId?: string;
  /** Explicit kind. If omitted, inferred from which id prop is present (serviceId wins). */
  kind?: Kind;

  /** Optional friendlier confirm like: “Delete ‘MacBook Pro’?” */
  productName?: string;
  /** Parent can optimistically remove the card, etc. */
  onDeletedAction?: () => void;
  /** How long user must hold to confirm (ms). Default 1000. */
  holdMs?: number;
};

export default function DeleteListingButton({
  id,
  productId,
  serviceId,
  kind,
  productName,
  onDeletedAction,
  holdMs = 1000,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  // --------- Resolve target ---------
  const resolvedKind: Kind = kind ?? (serviceId ? "service" : "product");
  const targetId = id ?? (resolvedKind === "service" ? serviceId : productId);

  // If we somehow weren't given any id, render a disabled button to be safe.
  const targetMissing = !targetId;

  // Long-press state (uses Pointer Events to cover mouse/touch/pen)
  const [progress, setProgress] = useState(0); // 0..1
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const holdingRef = useRef(false);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const minHold = Math.max(400, holdMs || 1000); // soft floor for UX

  function beginHold() {
    if (busy || pending || targetMissing) return;
    holdingRef.current = true;
    startRef.current = performance.now();

    const step = (now: number) => {
      if (!holdingRef.current) return;
      const elapsed = now - (startRef.current ?? now);
      const p = Math.min(1, elapsed / minHold);
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
    if (busy || pending || targetMissing) return;
    const label = productName ? `“${productName}”` : "this listing";
    const ok = window.confirm(`Delete ${label}? This cannot be undone.`);
    if (!ok) return;
    await actuallyDelete();
  }

  async function actuallyDelete() {
    if (busy || pending || targetMissing) return;
    setBusy(true);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);

    try {
      const base = resolvedKind === "service" ? "/api/services" : "/api/products";
      const r = await fetch(`${base}/${encodeURIComponent(String(targetId))}`, {
        method: "DELETE",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });

      clearTimeout(t);

      if (r.status === 401) {
        toast.error("Please sign in to delete listings.");
        const cb = encodeURIComponent("/dashboard");
        router.replace(`/signin?callbackUrl=${cb}`);
        return;
      }

      let j: unknown = null;
      try {
        j = await r.json();
      } catch {
        /* ignore non-JSON */
      }

      if (!r.ok) {
        const msg =
          (j && typeof j === "object" && "error" in j && typeof (j as any).error === "string"
            ? (j as any).error
            : "") || `Failed (${r.status})`;
        throw new Error(msg);
      }

      onDeletedAction?.();
      toast.success("Listing deleted.");
      startTransition(() => router.refresh());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || "Failed to delete");
    } finally {
      clearTimeout(t);
      setBusy(false);
    }
  }

  const disabled = busy || pending || targetMissing;
  const tipId = `delete-tip-${(targetId ?? "unknown").toString()}`;

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        disabled={disabled}
        onPointerDown={beginHold}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onPointerLeave={cancelHold}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void fallbackConfirmAndDelete();
          }
        }}
        onClick={(e) => {
          // If user just clicks (no hold), fall back to confirm dialog
          if (progress === 0 && !holdingRef.current) {
            e.preventDefault();
            void fallbackConfirmAndDelete();
          }
        }}
        className={`relative overflow-hidden rounded-md border px-2 py-1 text-sm font-medium transition
          ${disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-red-50"}
          border-red-200 text-red-700 dark:border-red-900/40 dark:hover:bg-red-900/20`}
        aria-disabled={disabled}
        aria-busy={disabled}
        aria-describedby={tipId}
        aria-label={
          productName
            ? `Delete ${productName}`
            : `Delete ${resolvedKind === "service" ? "service" : "listing"}`
        }
        title="Delete listing"
      >
        <span
          className="pointer-events-none absolute inset-0 bg-red-500/10"
          style={{ transform: `scaleX(${progress})`, transformOrigin: "left", willChange: "transform" }}
        />
        <span className="relative z-10 flex items-center gap-1">
          <span aria-hidden>🗑️</span>
          {disabled ? "Deleting…" : progress > 0 ? "Hold…" : "Delete"}
        </span>
      </button>

      <span id={tipId} className="ml-2 hidden text-xs text-gray-500 sm:inline">
        Tip: press &amp; hold to confirm
      </span>
    </div>
  );
}
