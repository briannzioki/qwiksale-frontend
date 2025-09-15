// src/app/components/ContactModal.tsx
"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";

/* ----------------------------- Types ----------------------------- */

type RevealPayload = {
  suggestLogin?: boolean;
  contact?: {
    name?: string | null;
    phone?: string | null;
    location?: string | null;
  };
  product?: { id: string; name: string };
  error?: string;
};

type Props = {
  productId: string;
  /** Optional: used to personalize WhatsApp text */
  productName?: string;
  /** Optional: used when API doesn’t return contact name/location */
  fallbackName?: string | null;
  fallbackLocation?: string | null;
  /** Optional: customize reveal button label */
  buttonLabel?: string;
  /** Optional extra classes for the trigger button */
  className?: string;
};

/* ------------------------- Phone Utilities ------------------------- */

function normalizeKenyanMsisdn(raw?: string | null): string | null {
  if (!raw) return null;
  let s = String(raw).trim();

  if (/^\+?254(7|1)\d{8}$/.test(s)) return s.replace(/^\+/, "");
  s = s.replace(/\D+/g, "");

  if (/^07\d{8}$/.test(s) || /^01\d{8}$/.test(s)) return "254" + s.slice(1);
  if (/^(7|1)\d{8}$/.test(s)) return "254" + s;
  if (s.startsWith("254") && s.length >= 12) return s.slice(0, 12);

  return null;
}

/* ------------------------- Event Utilities ------------------------- */

function emit(name: string, detail?: unknown) {
  // eslint-disable-next-line no-console
  console.log(`[qs:event] ${name}`, detail);
  if (typeof window !== "undefined" && "CustomEvent" in window) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

function track(event: string, payload?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.log("[qs:track]", event, payload);
  emit("qs:track", { event, payload });
}

/* ------------------------------ Component ------------------------------ */

export default function ContactModal({
  productId,
  productName,
  fallbackName,
  fallbackLocation,
  buttonLabel = "Show Contact",
  className = "",
}: Props) {
  const modalUid = useId(); // stable, unique per instance
  const modalId = `contact-modal-${modalUid}`;
  const descId = `${modalId}-desc`;

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<RevealPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const name = payload?.contact?.name ?? fallbackName ?? "—";
  const phone = payload?.contact?.phone ?? "—";
  const location = payload?.contact?.location ?? fallbackLocation ?? "—";

  const msisdn = useMemo(
    () => normalizeKenyanMsisdn(payload?.contact?.phone),
    [payload?.contact?.phone]
  );

  const waLink = useMemo(() => {
    if (!msisdn) return null;
    const pname = productName || payload?.product?.name || "your item";
    const seller = name && name !== "—" ? name : "Seller";
    const text = `Hi ${seller}, I'm interested in "${pname}" on QwikSale. Is it still available?`;
    return `https://wa.me/${msisdn}?text=${encodeURIComponent(text)}`;
  }, [msisdn, name, productName, payload?.product?.name]);

  const telLink = useMemo(() => (msisdn ? `tel:${msisdn}` : null), [msisdn]);

  const reveal = useCallback(async () => {
    if (!productId || loading) return;
    setLoading(true);
    setError(null);
    setPayload(null);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(productId)}/contact`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as RevealPayload;

      if (!res.ok || json?.error) {
        const msg = json?.error || `Failed to fetch contact (HTTP ${res.status})`;
        setError(msg);
        setOpen(true);
        track("contact_reveal_failed", { productId, message: msg });
        return;
      }

      setPayload(json);
      setOpen(true);
      track("contact_reveal", { productId });
      emit("qs:contact:reveal", { productId, contact: json?.contact });
    } catch (e: any) {
      const msg = "Network error. Please try again.";
      setError(msg);
      setOpen(true);
      track("contact_reveal_failed", { productId, message: e?.message || msg });
    } finally {
      setLoading(false);
    }
  }, [productId, loading]);

  // Close on Escape + focus trap
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

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

  // Prevent background scroll when open
  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  // Focus mgmt
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => closeBtnRef.current?.focus(), 10);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => triggerRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Click outside to close
  const onBackdropClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  };

  async function copyPhone() {
    const toCopy = payload?.contact?.phone || "";
    if (!toCopy) return;
    try {
      await navigator.clipboard.writeText(toCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
      track("contact_copy_phone", { productId });
    } catch {
      /* ignore clipboard failures */
    }
  }

  return (
    <div className="mt-4">
      <button
        ref={triggerRef}
        onClick={reveal}
        disabled={loading}
        type="button"
        className={[
          "px-4 py-2 rounded-xl text-sm",
          "bg-black text-white dark:bg-white dark:text-black",
          "disabled:opacity-60",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-busy={loading ? "true" : "false"}
        aria-haspopup="dialog"
        aria-controls={modalId}
      >
        {loading ? "Revealing…" : buttonLabel}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/40"
            aria-label="Close contact dialog"
            onClick={onBackdropClick}
          />

          {/* Dialog */}
          <div
            id={modalId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${modalId}-title`}
            aria-describedby={descId}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              ref={panelRef}
              className="bg-white dark:bg-gray-950 rounded-2xl w-full max-w-md p-5 shadow-lg border border-gray-200 dark:border-gray-800"
            >
              <p id={descId} className="sr-only">
                Seller contact details and quick actions.
              </p>

              {/* Optional safety nudge */}
              {payload?.suggestLogin && (
                <div className="mb-3 p-3 text-sm rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300 dark:border-yellow-900/50" role="note">
                  For safety, we recommend logging in first. You can still proceed.
                </div>
              )}

              <div className="mb-2 flex items-center justify-between">
                <h3 id={`${modalId}-title`} className="font-semibold text-gray-900 dark:text-gray-100">
                  Seller Contact
                </h3>
                <button
                  ref={closeBtnRef}
                  onClick={() => setOpen(false)}
                  type="button"
                  className="px-2 py-1 rounded-md border text-sm hover:bg-gray-50 dark:hover:bg-gray-900 dark:border-gray-700 dark:text-gray-200"
                >
                  Close
                </button>
              </div>

              {error ? (
                <div className="text-sm text-red-600 dark:text-red-400" role="alert" aria-live="polite">
                  {error}
                </div>
              ) : (
                <>
                  <div className="space-y-2 text-sm text-gray-800 dark:text-gray-200">
                    <div>
                      <span className="font-medium">Name:</span> {name}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Phone:</span>
                      <span>{phone}</span>
                      {payload?.contact?.phone && (
                        <button
                          onClick={copyPhone}
                          type="button"
                          className="ml-2 rounded border px-2 py-0.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-900 dark:border-gray-700"
                          title="Copy to clipboard"
                        >
                          {copied ? "Copied!" : "Copy"}
                        </button>
                      )}
                    </div>
                    <div>
                      <span className="font-medium">Location:</span> {location}
                    </div>
                  </div>

                  {/* CTAs */}
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    {waLink && (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl bg-[#25D366] px-3 py-1.5 text-sm text-white hover:opacity-90"
                        onClick={() => track("contact_whatsapp_click", { productId })}
                        aria-label="Open WhatsApp chat with seller"
                      >
                        WhatsApp
                      </a>
                    )}
                    {telLink && (
                      <a
                        href={telLink}
                        className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900 dark:text-gray-200"
                        onClick={() => track("contact_call_click", { productId })}
                        aria-label="Call seller"
                      >
                        Call
                      </a>
                    )}
                    <button
                      onClick={() => setOpen(false)}
                      type="button"
                      className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900 dark:text-gray-200"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
