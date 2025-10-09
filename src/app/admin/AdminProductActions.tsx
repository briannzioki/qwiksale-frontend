// src/app/admin/AdminProductActions.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function AdminProductActions({
  id,
  featured,
}: {
  id: string;
  featured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"feature" | "delete" | null>(null);
  const [optimisticFeatured, setOptimisticFeatured] = useState(featured);

  async function patchFeature(target: boolean, force = false) {
    const r = await fetch(`/api/admin/products/${encodeURIComponent(id)}/feature`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ featured: target, ...(force ? { force: true } : {}) }),
    });
    return r;
  }

  async function toggleFeatured() {
    if (busy) return;
    setBusy("feature");

    // Decide target first (avoids race)
    const target = !optimisticFeatured;

    // optimistic UI
    setOptimisticFeatured(target);

    try {
      let r = await patchFeature(target, false);

      // If product isn't ACTIVE, server returns 409 with {status}
      if (!r.ok && r.status === 409) {
        const j = await r.json().catch(() => ({} as any));
        const status = j?.status || "current status";
        const confirmForce = confirm(
          `Listing is ${status}. Feature toggle usually requires ACTIVE.\n\nForce anyway?`
        );
        if (confirmForce) {
          r = await patchFeature(target, true);
        }
      }

      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j?.error || `Failed: ${r.status}`);
        // revert optimistic state
        setOptimisticFeatured(!target);
        return;
      }

      startTransition(() => router.refresh());
    } catch {
      alert("Network error");
      setOptimisticFeatured(!target);
    } finally {
      setBusy(null);
    }
  }

  async function deleteProduct() {
    if (busy) return;
    if (!confirm("Delete this listing permanently?")) return;

    setBusy("delete");
    try {
      // Deletion stays on the main resource route (it already allows owner/admin)
      const r = await fetch(`/api/products/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j?.error || "Failed to delete");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      alert("Network error");
    } finally {
      setBusy(null);
    }
  }

  const isBusy = !!busy || pending;

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={toggleFeatured}
        disabled={isBusy}
        aria-pressed={optimisticFeatured}
        aria-busy={busy === "feature" || undefined}
        className={`rounded border px-3 py-1 text-sm transition ${
          optimisticFeatured
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "hover:bg-gray-50"
        } ${isBusy ? "opacity-60 cursor-wait" : ""}`}
        title={optimisticFeatured ? "Unfeature listing" : "Feature listing"}
      >
        {busy === "feature" ? "…" : optimisticFeatured ? "Unfeature" : "Feature"}
      </button>

      <button
        type="button"
        onClick={deleteProduct}
        disabled={isBusy}
        aria-busy={busy === "delete" || undefined}
        className={`rounded bg-red-600 text-white px-3 py-1 text-sm hover:bg-red-700 transition ${
          isBusy ? "opacity-70 cursor-wait" : ""
        }`}
        title="Delete listing"
      >
        {busy === "delete" ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}
