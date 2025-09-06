// src/app/components/DeleteListingButton.tsx
"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

/**
 * Danger action button to delete a listing.
 * - Safe with Next.js 15: no generic `onClick` props from Server; callback ends with "Action"
 * - Double-guarded (confirm dialog + cooldown)
 * - Emits client events:
 *    - "qs:track"            { event: "listing_delete", payload: { id } }
 *    - "qs:listing:deleted"  { id }
 */
export default function DeleteListingButton({
  id,
  className,
  afterDeleteAction, // ✅ safe name for Server Actions if passed from a Server Component
  label = "Delete",
  confirmText = "Delete this listing? This cannot be undone.",
}: {
  id: string;
  className?: string;
  /** Optional callback (can be a Server Action). Runs after a successful delete. */
  afterDeleteAction?: () => void | Promise<void>;
  label?: string;
  confirmText?: string;
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

  const track = useCallback((event: string, payload?: Record<string, unknown>) => {
    // eslint-disable-next-line no-console
    console.log("[qs:track]", event, payload);
    emit("qs:track", { event, payload });
  }, [emit]);

  const handleDelete = useCallback(async () => {
    // Basic cooldown to avoid double-click spam
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
        headers: {
          "Content-Type": "application/json",
        },
      });

      // Try to parse JSON but be resilient
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

      // Fire a lightweight client event for any listeners (e.g., list pages)
      emit("qs:listing:deleted", { id });

      // Optional post-delete hook (can be a Server Action)
      try {
        await afterDeleteAction?.();
      } catch (e) {
        // Log but don't block UX
        console.error("[DeleteListingButton] afterDeleteAction error:", e);
      }

      // Refresh server components
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
  }, [afterDeleteAction, confirmText, id, router, startTransition, track, emit, isDeleting]);

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className={
        className ??
        "inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/20"
      }
      aria-label="Delete listing"
      aria-busy={isDeleting}
      title={label}
    >
      {isDeleting ? "Deleting…" : label}
    </button>
  );
}
