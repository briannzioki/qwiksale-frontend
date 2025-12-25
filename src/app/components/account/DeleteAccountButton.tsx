"use client";
// src/app/components/account/DeleteAccountButton.tsx

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** Preferred prop name */
  userEmail?: string;
  /** Back-compat alias: prefer userEmail */
  email?: string;
  onDeletedAction?: () => void | Promise<void>;
  className?: string;
  children?: ReactNode;
  confirmLabel?: string;
};

export default function DeleteAccountButton({
  userEmail,
  email,
  onDeletedAction,
  className =
    "rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[var(--text)] shadow-sm transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus",
  children,
  confirmLabel = "Delete account",
}: Props) {
  const router = useRouter();
  const uid = useId();
  const titleId = `delacc-title-${uid}`;
  const descId = `delacc-desc-${uid}`;

  const effectiveEmail = (userEmail ?? email ?? "").trim();
  const normalizedEmail = useMemo(
    () => effectiveEmail.toLowerCase(),
    [effectiveEmail],
  );

  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const liveRef = useRef<HTMLSpanElement | null>(null);
  const liveTimerRef = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
    if (liveTimerRef.current) {
      window.clearTimeout(liveTimerRef.current);
      liveTimerRef.current = null;
    }
    el.textContent = msg;
    liveTimerRef.current = window.setTimeout(() => {
      if (el) el.textContent = "";
      liveTimerRef.current = null;
    }, 1200);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (liveTimerRef.current) {
        window.clearTimeout(liveTimerRef.current);
        liveTimerRef.current = null;
      }
    };
  }, []);

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
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable.length) return;
        const first = focusable.item(0);
        const last = focusable.item(focusable.length - 1);
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

  const handleDelete = useCallback(async () => {
    if (!effectiveEmail) return;
    if (!canDelete || loading) return;

    setLoading(true);
    setErr(null);
    emit("qs:account:delete:submit", { email: effectiveEmail });

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        signal: ac.signal,
        body: JSON.stringify({ confirm: true, email: effectiveEmail }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok)
        throw new Error((json as any)?.error || `Delete failed (${res.status})`);

      setOpen(false);
      setAck(false);
      setTyped("");
      announce("Account deleted");
      emit("qs:account:delete:success", { email: effectiveEmail });

      try {
        await onDeletedAction?.();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[DeleteAccountButton] onDeletedAction error:", e);
      }

      router.replace("/goodbye");
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      const message = e?.message || "Failed to delete account";
      setErr(message);
      announce("Delete failed");
      emit("qs:account:delete:error", { email: effectiveEmail, error: message });
    } finally {
      setLoading(false);
    }
  }, [effectiveEmail, canDelete, loading, onDeletedAction, announce, emit, router]);

  return (
    <>
      <span aria-live="polite" className="sr-only" ref={liveRef} />

      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) return;
          setOpen(true);
          emit("qs:account:delete:open", { email: effectiveEmail });
        }}
        className={className}
      >
        {children ?? "Delete account"}
      </button>

      {open && (
        <>
          <div
            role="presentation"
            className="fixed inset-0 z-50 bg-[var(--bg)] opacity-60 backdrop-brightness-50"
            onClick={() => {
              setOpen(false);
              emit("qs:account:delete:cancel", { email: effectiveEmail });
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              ref={dialogRef}
              className="w-full max-w-md rounded-2xl bg-[var(--bg-elevated)] p-5 shadow-soft border border-[var(--border-subtle)] text-[var(--text)]"
              aria-busy={loading ? "true" : "false"}
            >
              <h2
                id={titleId}
                className="text-lg font-extrabold tracking-tight text-[var(--text)]"
              >
                Delete your account?
              </h2>
              <p
                id={descId}
                className="mt-2 text-sm text-[var(--text-muted)] leading-relaxed"
              >
                This action is <strong>permanent</strong> and will remove your
                profile, listings, and data. To confirm, tick the box and type
                your email <span className="font-mono">{effectiveEmail}</span>{" "}
                below.
              </p>

              <label className="mt-4 flex items-start gap-2 text-sm text-[var(--text)]">
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
                <label className="text-xs text-[var(--text-muted)]">
                  Type your email to confirm
                </label>
                <input
                  type="email"
                  inputMode="email"
                  placeholder={effectiveEmail}
                  className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none transition focus-visible:outline-none focus-visible:ring-2 ring-focus"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  aria-invalid={ack && typed.length > 0 && !canDelete}
                />
                {ack && typed.length > 0 && !canDelete && (
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    Email does not match.
                  </div>
                )}
              </div>

              {err && (
                <div
                  className="mt-3 text-sm text-[var(--text)] rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2"
                  role="alert"
                  aria-live="polite"
                >
                  {err}
                </div>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  ref={cancelBtnRef}
                  type="button"
                  className="rounded-xl px-4 py-2 text-sm font-semibold border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus disabled:opacity-60"
                  onClick={() => {
                    setOpen(false);
                    setAck(false);
                    setTyped("");
                    setErr(null);
                    emit("qs:account:delete:cancel", { email: effectiveEmail });
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
                    "rounded-xl px-4 py-2 text-sm font-semibold transition active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus disabled:opacity-60",
                    canDelete
                      ? "bg-[var(--text)] text-[var(--bg)] hover:opacity-95"
                      : "border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-muted)]",
                  ].join(" ")}
                  aria-busy={loading ? "true" : "false"}
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
