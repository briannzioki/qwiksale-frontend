"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import toast from "react-hot-toast";
import IconButton from "@/app/components/IconButton";
import { normalizeKenyanPhone, makeWhatsAppLink } from "@/app/lib/phone";

type RevealPayload = {
  suggestLogin?: boolean;
  contact?: { name?: string | null; phone?: string | null; location?: string | null };
  product?: { id: string; name: string };
  error?: string;
};

type Props = {
  productId: string;
  productName?: string | undefined;
  fallbackName?: string | null | undefined;
  fallbackLocation?: string | null | undefined;
  /** Default updated per test requirements */
  buttonLabel?: string | undefined; // default "Message seller"
  className?: string | undefined;
};

function emit(name: string, detail?: unknown) {
  if (typeof window !== "undefined" && "CustomEvent" in window) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

function track(event: string, payload?: Record<string, unknown>) {
  emit("qs:track", { event, payload });
}

export default function ContactModal({
  productId,
  productName,
  fallbackName,
  fallbackLocation,
  buttonLabel = "Message seller",
  className = "",
}: Props) {
  const modalUid = useId();
  const modalId = `contact-modal-${modalUid}`;
  const descId = `${modalId}-desc`;

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<RevealPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const name = payload?.contact?.name ?? fallbackName ?? "-";
  const phone = payload?.contact?.phone ?? "-";
  const sellerLocation = payload?.contact?.location ?? fallbackLocation ?? "-";

  const msisdn = useMemo(
    () =>
      payload?.contact?.phone ? normalizeKenyanPhone(payload.contact.phone) : null,
    [payload?.contact?.phone],
  );

  const waLink = useMemo(() => {
    if (!msisdn) return null;
    const pname = productName || payload?.product?.name || "your item";
    const seller = name && name !== "-" ? name : "Seller";
    const text = `Hi ${seller}, I'm interested in "${pname}" on QwikSale. Is it still available?`;
    return makeWhatsAppLink(msisdn, text) ?? null;
  }, [msisdn, name, productName, payload?.product?.name]);

  const telLink = useMemo(() => (msisdn ? `tel:+${msisdn}` : null), [msisdn]);

  const share = useCallback(async () => {
    const shareUrl =
      typeof window !== "undefined" && window.location
        ? `${window.location.origin}/product/${productId}`
        : `/product/${productId}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: productName || payload?.product?.name || "Listing",
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Link copied");
      }
      track("product_share_click", { productId });
    } catch {
      /* ignore */
    }
  }, [productId, productName, payload?.product?.name]);

  const toggleSave = useCallback(() => {
    const next = !saved;
    setSaved(next);
    emit("qs:listing:save_toggled", {
      kind: "product",
      id: productId,
      saved: next,
    });
    track(next ? "product_saved" : "product_unsaved", { productId });
  }, [saved, productId]);

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
        setOpen(true); // Always show something on click
        track("contact_reveal_failed", { productId, message: msg });
        return;
      }

      setPayload(json);
      setOpen(true);
      track("contact_reveal", { productId });
      emit("qs:contact:reveal", {
        productId,
        contact: json?.contact,
      });
    } catch (e: any) {
      const msg = "Network error. Please try again.";
      setError(msg);
      setOpen(true);
      track("contact_reveal_failed", {
        productId,
        message: e?.message || msg,
      });
    } finally {
      setLoading(false);
    }
  }, [productId, loading]);

  // a11y: ESC + focus trap
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key !== "Tab" || !panelRef.current) return;

      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;

      const first = focusables.item(0);
      const last = focusables.item(focusables.length - 1);
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus restore
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => closeBtnRef.current?.focus(), 15);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => triggerRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

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
      /* ignore */
    }
  }

  return (
    <div className="mt-3 sm:mt-4">
      <button
        ref={triggerRef}
        onClick={reveal}
        disabled={loading}
        type="button"
        className={[
          // ✅ phone-first: smaller type + tighter horizontal padding, keep touch target
          "min-h-9 rounded-xl px-3 py-2 text-xs sm:px-4 sm:text-sm font-semibold shadow-sm",
          "bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border)]",
          "hover:bg-[var(--bg-subtle)]",
          "focus-visible:outline-none focus-visible:ring-2 ring-focus",
          "active:scale-[.99]",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-busy={loading ? "true" : "false"}
        aria-haspopup="dialog"
        aria-controls={modalId}
        aria-expanded={open}
        aria-label={buttonLabel}
        data-testid="message-seller-button"
      >
        {loading ? "Revealing…" : buttonLabel}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/40 supports-[backdrop-filter]:backdrop-blur-sm transition-opacity"
            aria-label="Close contact dialog"
            onClick={onBackdropClick}
          />
          <div
            id={modalId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${modalId}-title`}
            aria-describedby={descId}
            // ✅ phone-first: bottom sheet on xs, center on sm+
            className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4"
          >
            <div
              ref={panelRef}
              className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 sm:p-5 shadow-soft"
            >
              <p id={descId} className="sr-only">
                Seller contact details and quick actions.
              </p>

              {payload?.suggestLogin && (
                <div
                  className="mb-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-2.5 sm:p-3 text-xs sm:text-sm text-[var(--text)]"
                  role="note"
                >
                  <div className="font-semibold">Safety tip</div>
                  <div className="mt-0.5 text-[var(--text-muted)] leading-relaxed">
                    For safety, we recommend logging in first. You can still proceed.
                  </div>
                </div>
              )}

              <div className="mb-1.5 sm:mb-2 flex items-center justify-between gap-2">
                <h3
                  id={`${modalId}-title`}
                  className="text-sm sm:text-base font-extrabold tracking-tight text-[var(--text)]"
                >
                  Seller Contact
                </h3>
                <button
                  ref={closeBtnRef}
                  onClick={() => setOpen(false)}
                  type="button"
                  className={[
                    "min-h-9 rounded-xl px-3 py-2 text-xs sm:px-3 sm:py-1.5 sm:text-sm font-medium",
                    "border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)]",
                    "hover:bg-[var(--bg-subtle)]",
                    "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                    "active:scale-[.99]",
                  ].join(" ")}
                >
                  Close
                </button>
              </div>

              {error ? (
                <div
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-2.5 sm:p-3 text-xs sm:text-sm text-[var(--text)]"
                  role="alert"
                  aria-live="polite"
                >
                  <div className="font-semibold">Couldn’t load contact</div>
                  <div className="mt-0.5 text-[var(--text-muted)] leading-relaxed">
                    {error}
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-[var(--text)]">
                    <div className="leading-relaxed">
                      <span className="font-medium text-[var(--text-muted)]">
                        Name:
                      </span>{" "}
                      {name}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--text-muted)]">
                        Phone:
                      </span>
                      <span className="truncate">{phone}</span>

                      {payload?.contact?.phone && (
                        <button
                          onClick={copyPhone}
                          type="button"
                          className={[
                            "ml-2 min-h-9 rounded-lg px-3 py-2 sm:min-h-0 sm:px-2 sm:py-0.5 text-[11px] sm:text-xs font-medium",
                            "border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)]",
                            "hover:bg-[var(--bg-subtle)]",
                            "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                            "active:scale-[.99]",
                          ].join(" ")}
                          title="Copy to clipboard"
                        >
                          {copied ? "Copied!" : "Copy"}
                        </button>
                      )}
                    </div>

                    <div className="leading-relaxed">
                      <span className="font-medium text-[var(--text-muted)]">
                        Location:
                      </span>{" "}
                      {sellerLocation}
                    </div>
                  </div>

                  {/* ✅ phone-first: one-row action strip on xs; wrap on sm+ */}
                  <div className="mt-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mt-4 sm:flex-wrap sm:overflow-visible sm:whitespace-normal sm:justify-end">
                    {waLink && (
                      <IconButton
                        icon="message"
                        variant="outline"
                        labelText="Message"
                        srLabel="Message on WhatsApp"
                        onClick={() => {
                          try {
                            window.open(waLink, "_blank", "noopener,noreferrer");
                            track("contact_whatsapp_click", { productId });
                          } catch {
                            /* ignore */
                          }
                        }}
                      />
                    )}

                    {telLink && (
                      <IconButton
                        icon="phone"
                        variant="outline"
                        labelText="Call"
                        srLabel="Call seller"
                        onClick={() => {
                          try {
                            window.location.href = telLink;
                            track("contact_call_click", { productId });
                          } catch {
                            /* ignore */
                          }
                        }}
                      />
                    )}

                    <IconButton
                      icon="share"
                      variant="outline"
                      labelText="Share"
                      srLabel="Share listing"
                      onClick={() => void share()}
                    />

                    <IconButton
                      icon="heart"
                      variant="outline"
                      labelText={saved ? "Favorited" : "Favorite"}
                      srLabel={saved ? "Unfavorite listing" : "Favorite listing"}
                      aria-pressed={saved}
                      onClick={toggleSave}
                    />

                    <button
                      onClick={() => setOpen(false)}
                      type="button"
                      className={[
                        "min-h-9 rounded-xl px-3 py-2 text-xs sm:px-3 sm:py-1.5 sm:text-sm font-medium",
                        "border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)]",
                        "hover:bg-[var(--bg-subtle)]",
                        "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                        "active:scale-[.99]",
                      ].join(" ")}
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
