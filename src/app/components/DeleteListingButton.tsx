// src/app/components/DeleteListingButton.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function DeleteListingButton({
  id,
  className,
  afterDelete,
  label = "Delete",
  confirmText = "Delete this listing? This cannot be undone.",
}: {
  id: string;
  className?: string;
  afterDelete?: () => void;
  label?: string;
  confirmText?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function handleDelete() {
    if (!confirm(confirmText)) return;
    try {
      const r = await fetch(`/api/products/${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || j?.error) throw new Error(j?.error || `Failed (${r.status})`);
      toast.success("Listing deleted");
      afterDelete?.();
      startTransition(() => router.refresh()); // refresh server components
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      className={className ?? "text-red-600 hover:underline"}
      aria-label="Delete listing"
    >
      {pending ? "Deleting…" : label}
    </button>
  );
}
