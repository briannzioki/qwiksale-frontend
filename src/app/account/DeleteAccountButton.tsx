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

  const btnBase = [
    "inline-flex items-center justify-center",
    "min-h-9 rounded-xl px-3 py-2 text-xs font-semibold sm:px-4 sm:py-2.5 sm:text-sm",
    "border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm",
    "transition hover:bg-[var(--bg-subtle)] active:scale-[.99]",
    "focus-visible:outline-none focus-visible:ring-2 ring-focus",
  ].join(" ");

  return (
    <div className="space-y-3" data-testid="delete-account">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={btnBase}>
          Delete my account
        </button>
      ) : (
        <div
          className={[
            "space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-sm sm:p-4",
            "text-[var(--text)]",
          ].join(" ")}
        >
          <div className="grid gap-2">
            <label className="label text-[var(--text)]">
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

          <label className="inline-flex items-center gap-2 text-xs sm:text-sm text-[var(--text)]">
            <input
              type="checkbox"
              className="checkbox"
              checked={ack}
              disabled={busy}
              onChange={(e) => setAck(e.target.checked)}
            />
            I understand this action is permanent and cannot be undone.
          </label>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={doDelete}
              disabled={!canDelete}
              aria-busy={busy}
              className={[
                "inline-flex items-center justify-center",
                "min-h-9 rounded-xl px-3 py-2 text-xs font-semibold sm:px-4 sm:py-2.5 sm:text-sm",
                "border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text)] shadow-sm",
                "transition hover:bg-[var(--bg)] active:scale-[.99] disabled:opacity-50",
                "focus-visible:outline-none focus-visible:ring-2 ring-focus",
              ].join(" ")}
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
              className={[
                "inline-flex items-center justify-center",
                "min-h-9 rounded-xl px-3 py-2 text-xs font-semibold sm:px-4 sm:py-2.5 sm:text-sm",
                "border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm",
                "transition hover:bg-[var(--bg-subtle)] active:scale-[.99] disabled:opacity-60",
                "focus-visible:outline-none focus-visible:ring-2 ring-focus",
              ].join(" ")}
            >
              Cancel
            </button>
          </div>

          <p className="text-[11px] sm:text-xs leading-relaxed text-[var(--text-muted)]">
            Your listings, favorites, and related data will be removed. You can create a new
            account later, but your current data will not be recoverable.
          </p>
        </div>
      )}
    </div>
  );
}
