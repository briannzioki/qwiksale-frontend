"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteAccountButton({
  userEmail,
  onDeletedAction,
}: {
  userEmail: string;           // pass session.user.email to this
  onDeletedAction?: () => void;      // callback after successful deletion
}) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canDelete =
    ack && typed.trim().toLowerCase() === userEmail.toLowerCase();

  async function handleDelete() {
    if (!canDelete) return;
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, email: userEmail }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `Delete failed (${res.status})`);
      }

      setOpen(false);
      onDeletedAction?.();

      // Redirect to goodbye confirmation page
      router.replace("/goodbye");
    } catch (e: any) {
      setErr(e?.message || "Failed to delete account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-2xl bg-red-600 px-4 py-2 text-white shadow-sm hover:bg-red-700"
      >
        Delete account
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-lg">
            <h2 className="text-lg font-semibold text-red-700">
              Delete your account?
            </h2>
            <p className="mt-2 text-sm text-gray-700">
              This action is permanent and will remove your profile, listings,
              and data. Type your email to confirm, then press{" "}
              <strong>Delete account</strong>.
            </p>

            <label className="mt-4 flex items-start gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              <span>
                I understand this action is <strong>irreversible</strong>.
              </span>
            </label>

            <div className="mt-3">
              <label className="text-xs text-gray-600">
                Type your email to confirm
              </label>
              <input
                type="email"
                inputMode="email"
                placeholder={userEmail}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-300"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            </div>

            {err && <div className="mt-3 text-sm text-red-600">{err}</div>}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl px-4 py-2 text-sm ring-1 ring-gray-300"
                onClick={() => {
                  setOpen(false);
                  setAck(false);
                  setTyped("");
                  setErr(null);
                }}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canDelete || loading}
                className={`rounded-xl px-4 py-2 text-sm text-white ${
                  canDelete ? "bg-red-600 hover:bg-red-700" : "bg-red-300"
                }`}
              >
                {loading ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
