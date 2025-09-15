// src/app/components/DeleteListingButton.tsx
"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type Tone = "neutral" | "danger";

/**
 * Danger/neutral action button to delete a listing.
 * - Next.js 15 safe: `afterDeleteAction` name avoids Server Action collisions
 * - Double-guarded (confirm dialog + cooldown)
 * - Emits client events:
 *    - "qs:track"            { event: "listing_delete", payload: { id } }
 *    - "qs:listing:deleted"  { id }
 */
export default function DeleteListingButton({
  id,
  className,
  afterDeleteAction,
  label = "Delete",
  confirmText = "Delete this listing? This cannot be undone.",
  tone = "neutral", // ← default: not too red, matches theme
}: {
  id: string;
  className?: string;
  /** Optional callback (can be a Server Action). Runs after a successful delete. */
  afterDeleteAction?: () => void | Promise<void>;
  label?: string;
  confirmText?: string;
  /** Visual tone; "neutral" keeps within site theme, "danger" uses red accents. */
  tone?: Tone;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [_, startTransition] = useTransition();
  const cooldownUntilRef = useRef<number>(0);

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
    // Basic cooldown
    const now = Date.now();
    if (now < cooldownUntilRef.current || isDeleting) return;
    cooldownUntilRef.current = now + 800;

    if (!confirm(confirmText)) return;

    setIsDeleting(true);
    const ac = new AbortController();

    try {
      const r = await fetch(`/api/products/${encodeURIComponent(id)}`, {
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
      toast.success("Listing deleted");
      track("listing_delete", { id });

      emit("qs:listing:deleted", { id });

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
  }, [afterDeleteAction, confirmText, id, isDeleting, router, track, emit]);

  const toneClasses =
    tone === "danger"
      ? // classic red (only when explicitly requested)
        "border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/20"
      : // theme-friendly neutral (default): subtle navy/blue/gray
        "border-gray-300 text-gray-800 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800";

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
