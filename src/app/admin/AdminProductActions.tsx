"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
// If you use react-hot-toast, uncomment:
// import toast from "react-hot-toast";

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

  async function toggleFeatured() {
    if (busy) return;
    setBusy("feature");

    // optimistic UI
    setOptimisticFeatured((v) => !v);

    try {
      const r = await fetch(`/api/admin/products/${id}/feature`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: !optimisticFeatured }),
        cache: "no-store",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        // toast.error(j?.error || "Failed to update");
        alert(j?.error || "Failed to update");
        // revert optimistic state
        setOptimisticFeatured(featured);
        return;
      }
      // toast.success(optimisticFeatured ? "Marked featured" : "Unfeatured");
      startTransition(() => router.refresh());
    } catch (e) {
      // toast.error("Network error");
      alert("Network error");
      setOptimisticFeatured(featured);
    } finally {
      setBusy(null);
    }
  }

  async function deleteProduct() {
    if (busy) return;
    if (!confirm("Delete this listing permanently?")) return;
    setBusy("delete");
    try {
      const r = await fetch(`/api/products/${id}`, { method: "DELETE", cache: "no-store" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        // toast.error(j?.error || "Failed to delete");
        alert(j?.error || "Failed to delete");
        return;
      }
      // toast.success("Listing deleted");
      startTransition(() => router.refresh());
    } catch {
      // toast.error("Network error");
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
          optimisticFeatured ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "hover:bg-gray-50"
        } ${isBusy ? "opacity-60 cursor-wait" : ""}`}
        title={optimisticFeatured ? "Un-verify (remove featured)" : "Verify (mark featured)"}
      >
        {busy === "feature" ? "…" : optimisticFeatured ? "Unverify" : "Verify"}
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
