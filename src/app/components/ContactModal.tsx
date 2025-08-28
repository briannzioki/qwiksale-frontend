// src/app/components/ContactModal.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
};

function normalizeKenyanMsisdn(raw?: string | null): string | null {
  if (!raw) return null;
  let s = String(raw).trim();

  // If it's already +2547/ +2541 form, just drop the plus
  if (/^\+?254(7|1)\d{8}$/.test(s)) {
    return s.replace(/^\+/, "");
  }

  // Remove all non-digits
  s = s.replace(/\D+/g, "");

  // 07XXXXXXXX / 01XXXXXXXX -> 2547XXXXXXXX / 2541XXXXXXXX
  if (/^07\d{8}$/.test(s) || /^01\d{8}$/.test(s)) return "254" + s.slice(1);

  // 7XXXXXXXX / 1XXXXXXXX -> 2547XXXXXXXX / 2541XXXXXXXX
  if (/^(7|1)\d{8}$/.test(s)) return "254" + s;

  // Already 254***********, trim to 12 just in case
  if (s.startsWith("254") && s.length >= 12) return s.slice(0, 12);

  return null;
}

export default function ContactModal({
  productId,
  productName,
  fallbackName,
  fallbackLocation,
  buttonLabel = "Show Contact",
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<RevealPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
      const res = await fetch(`/api/products/${productId}/contact`, { cache: "no-store" });
      const json = (await res.json()) as RevealPayload;
      if (!res.ok || json?.error) {
        setError(json?.error || `Failed to fetch contact (HTTP ${res.status})`);
        setOpen(true);
        return;
      }
      setPayload(json);
      setOpen(true);
    } catch {
      setError("Network error. Please try again.");
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }, [productId, loading]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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

  // Focus the close button when the modal opens (basic focus management)
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => closeBtnRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Click outside to close
  const onBackdropClick = (e: React.MouseEvent<HTMLButtonElement>) => {
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
    } catch {
      /* noop */
    }
  }

  return (
    <div className="mt-4">
      <button
        onClick={reveal}
        disabled={loading}
        className="px-4 py-2 rounded-xl bg-black text-white text-sm disabled:opacity-60"
        aria-busy={loading ? "true" : "false"}
      >
        {loading ? "Revealing…" : buttonLabel}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <button
            className="fixed inset-0 z-50 bg-black/40"
            aria-label="Close contact dialog"
            onClick={onBackdropClick}
          />

          {/* Dialog */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-modal-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              ref={panelRef}
              className="bg-white rounded-2xl w-full max-w-md p-5 shadow-lg border border-gray-200"
            >
              {/* Optional safety nudge */}
              {payload?.suggestLogin && (
                <div className="mb-3 p-3 text-sm rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-800">
                  For safety, we recommend logging in first. You can still proceed.
                </div>
              )}

              <div className="flex items-center justify-between mb-2">
                <h3 id="contact-modal-title" className="font-semibold">
                  Seller Contact
                </h3>
                <button
                  ref={closeBtnRef}
                  onClick={() => setOpen(false)}
                  className="px-2 py-1 rounded-md border text-sm hover:bg-gray-50"
                >
                  Close
                </button>
              </div>

              {error ? (
                <div className="text-sm text-red-600">{error}</div>
              ) : (
                <>
                  <div className="space-y-1 text-sm">
                    <div>
                      <span className="font-medium">Name:</span> {name}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Phone:</span>
                      <span>{phone}</span>
                      {payload?.contact?.phone && (
                        <button
                          onClick={copyPhone}
                          className="ml-2 rounded border px-2 py-0.5 text-xs hover:bg-gray-50"
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
                  <div className="mt-4 flex flex-wrap gap-2 justify-end">
                    {waLink && (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-[#25D366] text-white text-sm hover:opacity-90"
                      >
                        WhatsApp
                      </a>
                    )}
                    {telLink && (
                      <a
                        href={telLink}
                        className="px-3 py-1.5 rounded-xl border text-sm hover:bg-gray-50"
                      >
                        Call
                      </a>
                    )}
                    <button
                      onClick={() => setOpen(false)}
                      className="px-3 py-1.5 rounded-xl border text-sm"
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
