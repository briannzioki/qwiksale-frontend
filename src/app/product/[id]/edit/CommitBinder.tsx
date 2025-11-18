"use client";
// src/app/product/[id]/edit/CommitBinder.tsx

import { useEffect } from "react";

/**
 * Intercepts the Sell form submit (inside #sell-form-host), commits staged media first,
 * then allows the form to submit normally.
 */
export default function CommitBinder({ productId }: { productId: string }) {
  useEffect(() => {
    const host = document.getElementById("sell-form-host");
    if (!host) return;

    const onSubmitCapture = async (ev: Event) => {
      const form = ev.target as HTMLFormElement | null;
      if (!form || !host.contains(form)) return;
      // Prevent default submit to commit media first
      ev.preventDefault();
      ev.stopPropagation();

      try {
        const key = `product:${productId}:media`;
        const w = window as unknown as { qsCommitters?: Record<string, () => Promise<unknown>> };
        const commit = w.qsCommitters?.[key];
        if (typeof commit === "function") {
          await commit(); // commit staged photos (PATCH /media + optional cleanup)
        }
      } catch {
        // swallow; the form will still submit after
      }

      // Resume the original submit
      try {
        form.submit();
      } catch {
        /* ignore */
      }
    };

    // Capture phase so we run before the form's own handlers
    host.addEventListener("submit", onSubmitCapture, true);
    return () => host.removeEventListener("submit", onSubmitCapture, true);
  }, [productId]);

  return null;
}
