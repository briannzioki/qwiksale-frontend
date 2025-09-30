// src/app/components/MessageActions.tsx
"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/** Shared base props (optional, exact types) */
type BaseProps = {
  targetId: string;
  label: "seller" | "provider";
  isAuthed?: boolean; // optional → must be boolean when present
  onStartMessageAction?: (targetId: string) => Promise<void> | void;
  className?: string;
};

function useNextParam() {
  const pathname = usePathname();
  return pathname || "/";
}

/** Internal base with shared behavior */
function MessageButtonBase({
  targetId,
  label,
  isAuthed,
  onStartMessageAction,
  className = "",
}: BaseProps) {
  const next = useNextParam();

  const [open, setOpen] = React.useState(false);
  const [body, setBody] = React.useState<React.ReactNode>(null);

  // a11y/dialog infra
  const uid = React.useId();
  const dialogId = `msg-action-${uid}`;
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = React.useRef<HTMLButtonElement | null>(null);

  // When dialog opens, lock body scroll & focus Close
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => closeBtnRef.current?.focus(), 20);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Trap focus & add ESC handler
  React.useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        (last as HTMLElement).focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        (first as HTMLElement).focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Restore focus to trigger when dialog closes
  React.useEffect(() => {
    if (!open) triggerRef.current?.focus();
  }, [open]);

  async function handleClick() {
    // Always open a dialog; decide content based on auth + handler outcome
    if (isAuthed === true && typeof onStartMessageAction === "function") {
      try {
        await onStartMessageAction(targetId);
        setBody(
          <p className="text-sm">
            Your conversation has been started for <code>{targetId}</code>.
          </p>
        );
        setOpen(true);
        return;
      } catch {
        // fall through to generic authed dialog
      }
    }

    if (isAuthed === true) {
      setBody(
        <div className="space-y-3 text-sm">
          <p>
            (Placeholder) You’re signed in — this is where we’d open a chat with the {label} for{" "}
            <code>{targetId}</code>.
          </p>
          <div>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-900"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      );
      setOpen(true);
      return;
    }

    // Guest: prompt to sign in (always visible CTA still works)
    const loginHref = `/signin?callbackUrl=${encodeURIComponent(next)}`;
    setBody(
      <div className="space-y-3 text-sm" aria-live="polite">
        <p>Please sign in to message the {label}.</p>
        <div className="flex gap-2">
          <a
            className="rounded-md border px-3 py-1.5 hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-900"
            href={loginHref}
          >
            Continue to sign in
          </a>
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-900"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
    setOpen(true);
  }

  const btnText = label === "seller" ? "Message seller" : "Message provider";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={btnText}
        aria-haspopup="dialog"
        aria-controls={dialogId}
        aria-expanded={open ? "true" : "false"}
        onClick={handleClick}
        className={[
          "w-full rounded-lg bg-[#161748] text-white px-4 py-2 font-medium hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#39a0ca]",
          className,
        ].join(" ")}
      >
        {btnText}
      </button>

      {open && (
        <>
          {/* Overlay (click to close) */}
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/60"
            aria-label="Close message dialog"
            onClick={() => setOpen(false)}
          />

          {/* Dialog */}
          <div
            id={dialogId}
            role="dialog"
            aria-modal="true"
            aria-labelledby="msg-action-title"
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          >
            <div
              ref={panelRef}
              className="w-full max-w-md rounded-2xl border bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 id="msg-action-title" className="text-sm font-semibold">
                  {btnText}
                </h2>
                <button
                  ref={closeBtnRef}
                  type="button"
                  className="rounded-md border px-2 py-1 text-sm hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-900"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  Close
                </button>
              </div>
              <div>{body}</div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/** Public: Product page button */
export function MessageSellerButton(props: {
  productId: string;
  isAuthed?: boolean;
  onStartMessageAction?: (productId: string) => Promise<void> | void;
  className?: string;
}) {
  return (
    <MessageButtonBase
      targetId={props.productId}
      label="seller"
      {...(props.isAuthed !== undefined ? { isAuthed: props.isAuthed } : {})}
      {...(props.onStartMessageAction ? { onStartMessageAction: props.onStartMessageAction } : {})}
      {...(props.className ? { className: props.className } : {})}
    />
  );
}

/** Public: Service page button */
export function MessageProviderButton(props: {
  serviceId: string;
  isAuthed?: boolean;
  onStartMessageAction?: (serviceId: string) => Promise<void> | void;
  className?: string;
}) {
  return (
    <MessageButtonBase
      targetId={props.serviceId}
      label="provider"
      {...(props.isAuthed !== undefined ? { isAuthed: props.isAuthed } : {})}
      {...(props.onStartMessageAction ? { onStartMessageAction: props.onStartMessageAction } : {})}
      {...(props.className ? { className: props.className } : {})}
    />
  );
}
