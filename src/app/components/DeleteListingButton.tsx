// src/app/components/DeleteListingButton.tsx
"use client";

import * as React from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import IconButton from "@/app/components/IconButton";
import { track, type EventName } from "@/app/lib/analytics";

type Kind = "product" | "service";
type LegacyType = Kind;

type RenderButton = (
  buttonProps: React.ButtonHTMLAttributes<HTMLButtonElement>
) => React.ReactNode;

/** Base props shared by all shapes */
type BaseProps = {
  id?: string;
  productName?: string;
  onDeletedAction?: () => void | Promise<void>;
  holdMs?: number;
  /** Visible label (optional). If omitted, renders icon-only with SR label. */
  label?: string;
  /** Additional classes applied to the wrapper (kept for back-compat). */
  className?: string;
  disabled?: boolean;

  /** New prop (preferred) */
  kind?: Kind;
  /** Legacy prop (back-compat) */
  type?: LegacyType;

  /**
   * Optional render override for the actual button.
   * If provided, we’ll pass through handlers/disabled/aria so you can render any control.
   * Example:
   *   renderButton={(buttonProps) => (
   *     <IconButton icon="delete" variant="outline" tone="danger" size="xs" {...buttonProps} />
   *   )}
   */
  renderButton?: RenderButton;

  /** Optional IconButton tuning (defaults: outline/danger/xs) */
  buttonSize?: "xs" | "sm" | "md" | "lg";
  buttonVariant?: "ghost" | "outline" | "solid";
  buttonTone?: "default" | "primary" | "danger";
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
    renderButton,
    buttonSize = "xs",
    buttonVariant = "outline",
    buttonTone = "danger",
  } = props;

  // Normalize kind (prefer new 'kind', fall back to legacy 'type', finally infer from provided id prop)
  const explicitKind: Kind | undefined = props.kind ?? props.type;

  const inferredKind: Kind =
    explicitKind ??
    ("serviceId" in props && typeof props.serviceId === "string" ? "service" : "product");

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

      await onDeletedAction?.();
      toast.success("Deleted.");

      // ✅ Emit specific analytics event per kind
      try {
        const evt: EventName =
          inferredKind === "service" ? "service_deleted" : "product_deleted";
        track(evt, { id: targetId, name: productName ?? undefined, kind: inferredKind });
      } catch {
        /* ignore analytics failures */
      }

      startTransition(() => router.refresh());
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    } finally {
      clearTimeout(t);
      setBusy(false);
    }
  }

  const isDisabled = !!(busy || pending || targetMissing || disabled);
  const showText = typeof label === "string" && label.trim().length > 0;

  // Shared button handlers/attrs passed to either: custom render or our IconButton
  const buttonProps: React.ButtonHTMLAttributes<HTMLButtonElement> = {
    type: "button",
    disabled: isDisabled,
    onPointerDown: beginHold,
    onPointerUp: cancelHold,
    onPointerCancel: cancelHold,
    onPointerLeave: cancelHold,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        void fallbackConfirmAndDelete();
      }
    },
    onClick: (e) => {
      // Simple click -> confirm dialog (no visible tip text)
      if (progress === 0 && !holdingRef.current) {
        e.preventDefault();
        void fallbackConfirmAndDelete();
      }
    },
    "aria-disabled": isDisabled,
    "aria-busy": busy || pending || undefined,
    "aria-label": productName
      ? `Delete ${productName}`
      : `Delete ${inferredKind === "service" ? "service" : "listing"}`,
    title: "Delete",
  };

  // Default button is our IconButton; can be overridden by renderButton
  const renderedButton = renderButton ? (
    renderButton(buttonProps)
  ) : (
    <IconButton
      icon="delete"
      variant={buttonVariant}
      tone={buttonTone}
      size={buttonSize}
      loading={busy || pending}
      // Text visible if provided; otherwise SR-only from aria-label above
      labelText={showText ? (isDisabled ? "Deleting…" : label) : undefined}
      className=""
      {...buttonProps}
    />
  );

  return (
    <span className={cn("relative inline-flex", className)}>
      {/* progress overlay */}
      <span
        className="pointer-events-none absolute left-0 top-0 h-full bg-rose-500/15"
        style={{ width: `${Math.round(progress * 100)}%`, borderRadius: "9999px" }}
        aria-hidden
      />
      {renderedButton}
    </span>
  );
}

// local tiny cn to avoid re-imports if you prefer it here
function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}
