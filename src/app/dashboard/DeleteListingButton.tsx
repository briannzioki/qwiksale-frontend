"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function DeleteListingButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (busy || pending) return;
    const sure = window.confirm("Delete this listing? This cannot be undone.");
    if (!sure) return;

    setBusy(true);
    try {
      const r = await fetch(`/api/products/${productId}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);

      toast.success("Listing deleted.");
      startTransition(() => router.refresh());
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onDelete}
      disabled={busy || pending}
      className="text-sm rounded-md border px-2 py-1 text-red-600 hover:bg-red-50 disabled:opacity-60"
      title="Delete listing"
    >
      {busy || pending ? "Deleting…" : "Delete"}
    </button>
  );
}
