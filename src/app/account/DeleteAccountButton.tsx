"use client";
// src/app/account/DeleteAccountButton.tsx

import { useState } from "react";
import { signOut } from "next-auth/react";
import toast from "react-hot-toast";

type Props = {
  /** The signed-in user's email (used to confirm). */
  email: string;
};

export default function DeleteAccountButton({ email }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);

  const canDelete =
    !!email &&
    confirmEmail.trim().toLowerCase() === email.trim().toLowerCase() &&
    ack &&
    !busy;

  async function doDelete() {
    if (!canDelete) return;
    setBusy(true);
    try {
      const r = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ confirm: true, email }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg =
          (j as any)?.error ||
          (r.status === 401 ? "Please sign in again." : "Failed to delete account.");
        toast.error(msg);
        return;
      }

      toast.success("Account deleted. Signing you out…");

      // Best effort: sign out and send to goodbye page (v5: redirectTo)
      try {
        await signOut({ redirectTo: "/goodbye" });
      } catch {
        // Fallback hard redirect if signOut hiccups
        window.location.href = "/goodbye?signout=1";
      }
    } catch {
      toast.error("Network error while deleting account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="delete-account">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-outline border-red-600 text-red-700 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/20"
        >
          Delete my account
        </button>
      ) : (
        <div className="rounded-lg border border-red-300/60 dark:border-red-800/50 p-3 space-y-3">
          <div className="grid gap-2">
            <label className="label text-red-700 dark:text-red-400">
              To confirm, type your email:
            </label>
            <input
              className="input"
              placeholder="your-email@example.com"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              disabled={busy}
              inputMode="email"
              autoComplete="email"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="checkbox"
              checked={ack}
              disabled={busy}
              onChange={(e) => setAck(e.target.checked)}
            />
            I understand this action is permanent and cannot be undone.
          </label>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={doDelete}
              disabled={!canDelete}
              aria-busy={busy}
              className="btn-outline border-red-700 bg-red-600/10 text-red-800 hover:bg-red-600/20 disabled:opacity-50 dark:text-red-300 dark:border-red-700"
            >
              {busy ? "Deleting…" : "Permanently delete account"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmEmail("");
                setAck(false);
              }}
              disabled={busy}
              className="btn-outline"
            >
              Cancel
            </button>
          </div>

          <p className="text-xs text-gray-500 dark:text-slate-400">
            Your listings, favorites, and related data will be removed. You can create a new
            account later, but your current data will not be recoverable.
          </p>
        </div>
      )}
    </div>
  );
}
