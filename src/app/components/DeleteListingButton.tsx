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
  buttonProps: React.ButtonHTMLAttributes<HTMLButtonElement>,
) => React.ReactNode;

type BaseProps = {
  id?: string;
  productName?: string;
  onDeletedAction?: () => void | Promise<void>;
  holdMs?: number;
  label?: string;
  className?: string;
  disabled?: boolean;
  kind?: Kind;
  type?: LegacyType;
  renderButton?: RenderButton;
  buttonSize?: "xs" | "sm" | "md" | "lg";
  buttonVariant?: "ghost" | "outline" | "solid";
  buttonTone?: "default" | "primary" | "danger";
  /** Optional redirect destination after successful delete. If omitted, we just refresh the current page. */
  redirectHref?: string;
};

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
    redirectHref,
  } = props;

  const explicitKind: Kind | undefined = props.kind ?? props.type;

  const inferredKind: Kind =
    explicitKind ??
    ("serviceId" in props && typeof props.serviceId === "string"
      ? "service"
      : "product");

  const targetId: string | undefined =
    id ??
    (inferredKind === "service"
      ? "serviceId" in props
        ? props.serviceId
        : undefined
      : "productId" in props
        ? props.productId
        : undefined);

  const targetMissing = !targetId;

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const [progress, setProgress] = useState(0);
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
        const here =
          typeof window !== "undefined"
            ? window.location.pathname + window.location.search + window.location.hash
            : "/dashboard";
        const dest = `/signin?callbackUrl=${encodeURIComponent(here || "/")}`;
        router.replace(dest);
        return;
      }

      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || j?.error) {
        throw new Error(j?.error || `Failed (${r.status})`);
      }

      // Allow caller to run extra side-effects (ideally not navigation).
      if (onDeletedAction) {
        await onDeletedAction();
      }

      toast.success(inferredKind === "service" ? "Service deleted." : "Listing deleted.");

      // Analytics is best-effort.
      try {
        const evt: EventName =
          inferredKind === "service" ? "service_deleted" : "product_deleted";
        track(evt, { id: targetId, name: productName ?? undefined, kind: inferredKind });
      } catch {
        // ignore
      }

      startTransition(() => {
        if (redirectHref) {
          router.push(redirectHref);
        } else {
          router.refresh();
        }
      });
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    } finally {
      clearTimeout(t);
      setBusy(false);
    }
  }

  const isDisabled = !!(busy || pending || targetMissing || disabled);
  const showText = typeof label === "string" && label.trim().length > 0;

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

  const renderedButton = renderButton ? (
    renderButton(buttonProps)
  ) : (
    <IconButton
      icon="delete"
      variant={buttonVariant}
      tone={buttonTone}
      size={buttonSize}
      loading={busy || pending}
      labelText={showText ? (isDisabled ? "Deleting…" : label) : undefined}
      {...buttonProps}
    />
  );

  return (
    <span
      className={cn(
        // ✅ phone-first: match the rest of the UI (rounded-xl), keep compact inline sizing
        "relative inline-flex overflow-hidden rounded-xl align-middle",
        className,
      )}
    >
      <span
        // ✅ inherits radius, looks cleaner in tight card toolbars on phones
        className="pointer-events-none absolute inset-y-0 left-0 rounded-[inherit] bg-[color:var(--danger-soft)] opacity-60"
        style={{ width: `${Math.round(progress * 100)}%` }}
        aria-hidden
      />
      {renderedButton}
    </span>
  );
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}
