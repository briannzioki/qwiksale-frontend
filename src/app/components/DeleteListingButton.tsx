// src/app/components/DeleteListingButton.tsx
"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type Tone = "neutral" | "danger";

/**
 * DeleteListingButton
 *
 * Works for both products and services.
 * Accepts any of:
 *  - { productId: string }
 *  - { serviceId: string }
 *  - { id: string, type: "product" | "service" }   // fallback form
 *
 * Other props:
 *  - afterDeleteAction?: () => void | Promise<void>
 *  - label?: string
 *  - confirmText?: string
 *  - tone?: "neutral" | "danger"
 *  - className?: string
 *
 * Emits client events:
 *    - "qs:track"            { event: "listing_delete", payload: { id, type } }
 *    - "qs:listing:deleted"  { id, type }
 */
type BaseProps = {
  className?: string;
  afterDeleteAction?: () => void | Promise<void>;
  label?: string;
  confirmText?: string;
  tone?: Tone;
};

type ProductProps = BaseProps & {
  productId: string;
  serviceId?: never;
  id?: never;
  type?: "product";
};

type ServiceProps = BaseProps & {
  serviceId: string;
  productId?: never;
  id?: never;
  type?: "service";
};

type GenericProps = BaseProps & {
  id: string;
  type: "product" | "service";
  productId?: never;
  serviceId?: never;
};

type Props = ProductProps | ServiceProps | GenericProps;

export default function DeleteListingButton(props: Props) {
  const {
    className,
    afterDeleteAction,
    label = "Delete",
    confirmText,
    tone = "neutral",
  } = props;

  // Resolve target type + id from flexible props
  const targetType: "product" | "service" =
    "type" in props && props.type
      ? props.type
      : "productId" in props && props.productId
      ? "product"
      : "serviceId" in props && props.serviceId
      ? "service"
      : "product"; // default

  const targetId: string =
    ("productId" in props && props.productId) ||
    ("serviceId" in props && props.serviceId) ||
    ("id" in props && props.id) ||
    "";

  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [_, startTransition] = useTransition();
  const cooldownUntilRef = useRef<number>(0);

  const effectiveConfirm =
    confirmText ??
    (targetType === "service"
      ? "Delete this service? This cannot be undone."
      : "Delete this listing? This cannot be undone.");

  const emit = useCallback((name: string, detail?: unknown) => {
    // eslint-disable-next-line no-console
    console.log(`[qs:event] ${name}`, detail);
    if (typeof window !== "undefined" && "CustomEvent" in window) {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  }, []);

  const track = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      // eslint-disable-next-line no-console
      console.log("[qs:track]", event, payload);
      emit("qs:track", { event, payload });
    },
    [emit]
  );

  const handleDelete = useCallback(async () => {
    if (!targetId) {
      toast.error("Missing listing id");
      return;
    }

    // Basic cooldown
    const now = Date.now();
    if (now < cooldownUntilRef.current || isDeleting) return;
    cooldownUntilRef.current = now + 800;

    if (!confirm(effectiveConfirm)) return;

    setIsDeleting(true);
    const ac = new AbortController();

    try {
      const endpoint =
        targetType === "service"
          ? `/api/services/${encodeURIComponent(targetId)}`
          : `/api/products/${encodeURIComponent(targetId)}`;

      const r = await fetch(endpoint, {
        method: "DELETE",
        signal: ac.signal,
        headers: { "Content-Type": "application/json" },
      });

      let j: any = null;
      try {
        j = await r.json();
      } catch {
        /* ignore non-JSON */
      }

      if (!r.ok || j?.error) {
        const msg = j?.error || `Failed (${r.status})`;
        throw new Error(msg);
      }

      toast.dismiss();
      toast.success("Deleted");
      track("listing_delete", { id: targetId, type: targetType });

      emit("qs:listing:deleted", { id: targetId, type: targetType });

      try {
        await afterDeleteAction?.();
      } catch (e) {
        console.error("[DeleteListingButton] afterDeleteAction error:", e);
      }

      startTransition(() => router.refresh());
    } catch (e: any) {
      const message =
        e?.name === "AbortError"
          ? "Delete cancelled"
          : e?.message || "Delete failed";
      toast.dismiss();
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  }, [afterDeleteAction, effectiveConfirm, isDeleting, targetId, targetType, router, track, emit]);

  const toneClasses =
    tone === "danger"
      ? "border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/20"
      : "border-gray-300 text-gray-800 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800";

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className={
        className ??
        [
          "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-semibold transition",
          toneClasses,
          isDeleting ? "opacity-60 cursor-wait" : "",
        ].join(" ")
      }
      aria-label="Delete listing"
      aria-busy={isDeleting}
      title={label}
    >
      {isDeleting ? "Deleting…" : label}
    </button>
  );
}
