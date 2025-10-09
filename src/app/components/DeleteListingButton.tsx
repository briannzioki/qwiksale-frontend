// src/app/components/DeleteListingButton.tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type Kind = "product" | "service";
type LegacyType = Kind;

/** Base props shared by all shapes */
type BaseProps = {
  id?: string;
  productName?: string;
  onDeletedAction?: () => void;
  holdMs?: number;
  label?: string;
  className?: string;
  disabled?: boolean;
  /** New prop (preferred) */
  kind?: Kind;
  /** Legacy prop (back-compat) */
  type?: LegacyType;
};

/** Accept any of: id | productId | serviceId (optionally with kind/type) */
type Props =
  | (BaseProps & { id: string; productId?: never; serviceId?: never })
  | (BaseProps & { productId: string; id?: never; serviceId?: never })
  | (BaseProps & { serviceId: string; id?: never; productId?: never });

export default function DeleteListingButton(props: Props) {
  const {
    id,
    productName,
    onDeletedAction,
    holdMs = 900,
    label,
    className = "",
    disabled = false,
  } = props;

  // Normalize kind (prefer new 'kind', fall back to legacy 'type', finally infer from provided id prop)
  const explicitKind: Kind | undefined = props.kind ?? props.type;

  const inferredKind: Kind =
    explicitKind ??
    ("serviceId" in props && typeof props.serviceId === "string"
      ? "service"
      : "product");

  const targetId: string | undefined =
    id ??
    (inferredKind === "service"
      ? ("serviceId" in props ? props.serviceId : undefined)
      : ("productId" in props ? props.productId : undefined));

  const targetMissing = !targetId;

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  // --- Long-press state (mouse/touch/pen) ---
  const [progress, setProgress] = useState(0); // 0..1
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const holdingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const minHold = Math.max(400, holdMs || 900);

  function beginHold() {
    if (busy || pending || targetMissing || disabled) return;
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
    if (busy || pending || targetMissing || disabled) return;
    const hint = productName ? `“${productName}”` : "this listing";
    if (!window.confirm(`Delete ${hint}? This cannot be undone.`)) return;
    await actuallyDelete();
  }

  async function actuallyDelete() {
    if (busy || pending || targetMissing || disabled) return;
    setBusy(true);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);

    try {
      const base = inferredKind === "service" ? "/api/services" : "/api/products";
      const r = await fetch(`${base}/${encodeURIComponent(String(targetId))}`, {
        method: "DELETE",
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      clearTimeout(t);

      if (r.status === 401) {
        toast.error("Please sign in.");
        router.replace(`/signin?callbackUrl=${encodeURIComponent("/dashboard")}`);
        return;
      }

      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || j?.error) {
        throw new Error(j?.error || `Failed (${r.status})`);
      }

      onDeletedAction?.();
      toast.success("Deleted.");
      startTransition(() => router.refresh());
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    } finally {
      clearTimeout(t);
      setBusy(false);
    }
  }

  const isDisabled = busy || pending || targetMissing || disabled;
  const showText = typeof label === "string" && label.trim().length > 0;

  return (
    <button
      type="button"
      disabled={isDisabled}
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
        // Simple click -> confirm dialog (no visible tip text)
        if (progress === 0 && !holdingRef.current) {
          e.preventDefault();
          void fallbackConfirmAndDelete();
        }
      }}
      aria-disabled={isDisabled}
      aria-busy={isDisabled ? "true" : "false"}
      aria-label={
        productName
          ? `Delete ${productName}`
          : `Delete ${inferredKind === "service" ? "service" : "listing"}`
      }
      title="Delete"
      className={[
        "relative inline-flex items-center justify-center rounded-md",
        "border border-red-300 bg-white text-red-600 hover:bg-red-50",
        "dark:border-red-900/40 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-900/20",
        "px-2 py-1 text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      ].join(" ")}
    >
      {/* progress overlay (no extra text) */}
      <span
        className="pointer-events-none absolute inset-0 bg-red-500/10"
        style={{ transform: `scaleX(${progress})`, transformOrigin: "left" }}
        aria-hidden
      />
      <span className="relative z-10 flex items-center gap-1">
        <span aria-hidden>🗑️</span>
        {showText ? (isDisabled ? "Deleting…" : label) : null}
      </span>
    </button>
  );
}
