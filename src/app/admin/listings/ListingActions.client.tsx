// src/app/admin/listings/ListingActions.client.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function ListingActions({
  id,
  kind,
  suspended,
}: {
  id: string;
  kind: "product" | "service";
  suspended: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const toggle = (nextSuspended: boolean) => {
    const label = nextSuspended ? "suspend" : "unsuspend";
    const msg = nextSuspended
      ? "Suspend this listing? It will be blocked from the marketplace."
      : "Unsuspend this listing and return it to normal visibility?";
    if (!confirm(msg)) return;

    start(async () => {
      try {
        const res = await fetch("/api/admin/listings/suspend", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId: id,
            kind,
            suspended: nextSuspended,
          }),
        });
        if (!res.ok) {
          let text = `${res.status}`;
          try {
            const j = (await res.json()) as any;
            text = String(j?.error || text);
          } catch {
            // ignore
          }
          alert(`Failed to ${label} listing: ${text}`);
          return;
        }
        router.refresh();
      } catch {
        alert("Network error while updating listing.");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={() => toggle(!suspended)}
      className={[
        "inline-flex items-center justify-center",
        "rounded-xl px-2.5 py-1.5 text-xs font-semibold",
        "border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)]",
        "transition hover:bg-[var(--bg-subtle)] active:scale-[.99]",
        "focus-visible:outline-none focus-visible:ring-2 ring-focus",
        suspended ? "shadow-sm" : "shadow-sm",
        "disabled:opacity-60",
      ].join(" ")}
      disabled={pending}
      aria-busy={pending}
      title={suspended ? "Unsuspend listing" : "Suspend listing"}
    >
      {suspended ? "Unsuspend" : "Suspend"}
    </button>
  );
}
