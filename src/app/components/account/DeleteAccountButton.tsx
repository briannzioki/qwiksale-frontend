// src/app/components/account/DeleteAccountButton.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteAccountButton({
  userEmail,
  onDeletedAction,
  className = "rounded-2xl bg-red-600 px-4 py-2 text-white shadow-sm hover:bg-red-700",
  children,
  confirmLabel = "Delete account",
}: {
  userEmail: string;
  onDeletedAction?: () => void | Promise<void>;
  className?: string;
  children?: React.ReactNode;
  confirmLabel?: string;
}) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const liveRef = useRef<HTMLSpanElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const normalizedEmail = useMemo(() => userEmail.trim().toLowerCase(), [userEmail]);
  const canDelete = ack && typed.trim().toLowerCase() === normalizedEmail;

  const emit = useCallback((name: string, detail?: unknown) => {
    // eslint-disable-next-line no-console
    console.log(`[qs:event] ${name}`, detail);
    if (typeof window !== "undefined" && "CustomEvent" in window) {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  }, []);

  const announce = useCallback((msg: string) => {
    const el = liveRef.current;
    if (!el) return;
    el.textContent = msg;
    const t = setTimeout(() => (el.textContent = ""), 1200);
    return () => clearTimeout(t);
  }, []);

  /* --------------------------- open/close effects --------------------------- */
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        // Use .item() and guard to satisfy strict TS
        const first = focusable.item(0);
        const last = focusable.item(focusable.length - 1);
        if (!first || !last) return;

        const active = document.activeElement as HTMLElement | null;

        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Body scroll lock + initial focus
  useEffect(() => {
    const body = document.body;
    if (open) {
      const prev = body.style.overflow;
      body.style.overflow = "hidden";
      const t = setTimeout(() => cancelBtnRef.current?.focus(), 10);
      announce("Delete account dialog opened");
      return () => {
        clearTimeout(t);
        body.style.overflow = prev;
      };
    } else {
      const t = setTimeout(() => triggerRef.current?.focus(), 0);
      announce("Dialog closed");
      return () => clearTimeout(t);
    }
  }, [open, announce]);

  /* -------------------------------- actions ------------------------------- */
  const handleDelete = useCallback(async () => {
    if (!canDelete || loading) return;
    setLoading(true);
    setErr(null);
    emit("qs:account:delete:submit", { email: userEmail });

    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, email: userEmail }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error((json as any)?.error || `Delete failed (${res.status})`);
      }

      setOpen(false);
      setAck(false);
      setTyped("");
      announce("Account deleted");
      emit("qs:account:delete:success", { email: userEmail });

      try {
        await onDeletedAction?.();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[DeleteAccountButton] onDeletedAction error:", e);
      }

      router.replace("/goodbye");
    } catch (e: any) {
      const message = e?.message || "Failed to delete account";
      setErr(message);
      announce("Delete failed");
      emit("qs:account:delete:error", { email: userEmail, error: message });
    } finally {
      setLoading(false);
    }
  }, [announce, canDelete, loading, onDeletedAction, router, userEmail, emit]);

  /* --------------------------------- render -------------------------------- */
  return (
    <>
      <span aria-live="polite" className="sr-only" ref={liveRef} />

      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen(true);
          emit("qs:account:delete:open", { email: userEmail });
        }}
        className={className}
      >
        {children ?? "Delete account"}
      </button>

      {open && (
        <>
          <button
            className="fixed inset-0 z-50 bg-black/40"
            aria-label="Close delete account dialog"
            onClick={() => {
              setOpen(false);
              emit("qs:account:delete:cancel", { email: userEmail });
            }}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delacc-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              ref={dialogRef}
              className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-950 p-5 shadow-lg border border-gray-200 dark:border-gray-800"
            >
              <h2 id="delacc-title" className="text-lg font-semibold text-red-700 dark:text-red-400">
                Delete your account?
              </h2>
              <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                This action is <strong>permanent</strong> and will remove your profile, listings, and data.
                To confirm, tick the box and type your email <span className="font-mono">{userEmail}</span> below.
              </p>

              <label className="mt-4 flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
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
                <label className="text-xs text-gray-600 dark:text-gray-400">
                  Type your email to confirm
                </label>
                <input
                  type="email"
                  inputMode="email"
                  placeholder={userEmail}
                  className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-300 dark:focus:ring-red-800"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  aria-invalid={ack && typed.length > 0 && !canDelete}
                />
                {ack && typed.length > 0 && !canDelete && (
                  <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    Email does not match.
                  </div>
                )}
              </div>

              {err && (
                <div className="mt-3 text-sm text-red-600 dark:text-red-400">
                  {err}
                </div>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  ref={cancelBtnRef}
                  type="button"
                  className="rounded-xl px-4 py-2 text-sm ring-1 ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900"
                  onClick={() => {
                    setOpen(false);
                    setAck(false);
                    setTyped("");
                    setErr(null);
                    emit("qs:account:delete:cancel", { email: userEmail });
                  }}
                  disabled={loading}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={!canDelete || loading}
                  className={[
                    "rounded-xl px-4 py-2 text-sm text-white",
                    canDelete ? "bg-red-600 hover:bg-red-700" : "bg-red-300 dark:bg-red-800/40",
                  ].join(" ")}
                >
                  {loading ? "Deleting…" : confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
