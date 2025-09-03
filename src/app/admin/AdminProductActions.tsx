"use client";

import { useState } from "react";

export default function AdminProductActions({
  id,
  featured,
}: {
  id: string;
  featured: boolean;
}) {
  const [busy, setBusy] = useState<"feature" | "delete" | null>(null);

  async function toggleFeatured() {
    if (busy) return;
    setBusy("feature");
    try {
      const r = await fetch(`/api/admin/products/${id}/feature`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: !featured }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j?.error || "Failed to update");
        return;
      }
      location.reload();
    } finally {
      setBusy(null);
    }
  }

  async function deleteProduct() {
    if (busy) return;
    if (!confirm("Delete this listing permanently?")) return;
    setBusy("delete");
    try {
      const r = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j?.error || "Failed to delete");
        return;
      }
      location.reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={toggleFeatured}
        disabled={!!busy}
        className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
        title={featured ? "Un-verify (remove featured)" : "Verify (mark featured)"}
      >
        {busy === "feature" ? "…" : featured ? "Unverify" : "Verify"}
      </button>
      <button
        onClick={deleteProduct}
        disabled={!!busy}
        className="rounded bg-red-600 text-white px-3 py-1 text-sm hover:bg-red-700"
        title="Delete listing"
      >
        {busy === "delete" ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}
