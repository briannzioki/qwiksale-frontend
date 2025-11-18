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
import {
  normalizeKenyanPhone,
  makeWhatsAppLink,
} from "@/app/lib/phone";

type RevealPayload = {
  suggestLogin?: boolean;
  contact?: {
    name?: string | null;
    phone?: string | null;
    location?: string | null;
  };
  service?: { id: string; name: string };
  error?: string;
};

type Props = {
  serviceId: string;
  serviceName?: string;
  fallbackName?: string | null;
  fallbackLocation?: string | null;
  /** Standardized label */
  buttonLabel?: string; // default "Message provider"
  className?: string;
};

function emit(name: string, detail?: unknown) {
  if (
    typeof window !== "undefined" &&
    "CustomEvent" in window
  ) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}
function track(
  event: string,
  payload?: Record<string, unknown>
) {
  emit("qs:track", { event, payload });
}

export default function ContactModalService({
  serviceId,
  serviceName,
  fallbackName,
  fallbackLocation,
  buttonLabel = "Message provider",
  className = "",
}: Props) {
  const modalUid = useId();
  const modalId = `service-contact-modal-${modalUid}`;
  const descId = `${modalId}-desc`;

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] =
    useState<RevealPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const triggerRef =
    useRef<HTMLButtonElement | null>(null);
  const closeBtnRef =
    useRef<HTMLButtonElement | null>(null);
  const panelRef =
    useRef<HTMLDivElement | null>(null);

  const name =
    payload?.contact?.name ??
    fallbackName ??
    "—";
  const phone =
    payload?.contact?.phone ?? "—";
  const providerLocation =
    payload?.contact?.location ??
    fallbackLocation ??
    "—";

  const msisdn = useMemo(
    () =>
      payload?.contact?.phone
        ? normalizeKenyanPhone(
            payload.contact.phone
          )
        : null,
    [payload?.contact?.phone]
  );

  const waLink = useMemo(() => {
    if (!msisdn) return null;
    const sname =
      serviceName ||
      payload?.service?.name ||
      "your service";
    const provider =
      name && name !== "—"
        ? name
        : "Provider";
    const text = `Hi ${provider}, I'm interested in "${sname}" on QwikSale. Are you available?`;
    return (
      makeWhatsAppLink(msisdn, text) ?? null
    );
  }, [msisdn, name, serviceName, payload?.service?.name]);

  const telLink = useMemo(
    () => (msisdn ? `tel:+${msisdn}` : null),
    [msisdn]
  );

  const share = useCallback(async () => {
    const shareUrl =
      typeof window !== "undefined" &&
      window.location
        ? `${window.location.origin}/service/${serviceId}`
        : `/service/${serviceId}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title:
            serviceName ||
            payload?.service?.name ||
            "Service",
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(
          shareUrl
        );
        toast.success("Link copied");
      }
      track("service_share_click", {
        serviceId,
      });
    } catch {
      /* ignore */
    }
  }, [serviceId, serviceName, payload?.service?.name]);

  const toggleSave = useCallback(() => {
    const next = !saved;
    setSaved(next);
    emit("qs:listing:save_toggled", {
      kind: "service",
      id: serviceId,
      saved: next,
    });
    track(
      next
        ? "service_saved"
        : "service_unsaved",
      { serviceId }
    );
  }, [saved, serviceId]);

  const reveal = useCallback(async () => {
    if (!serviceId || loading) return;
    setLoading(true);
    setError(null);
    setPayload(null);

    try {
      const res = await fetch(
        `/api/services/${encodeURIComponent(
          serviceId
        )}/contact`,
        { cache: "no-store" }
      );
      const json =
        (await res
          .json()
          .catch(() => ({}))) as RevealPayload;

      if (!res.ok || json?.error) {
        const msg =
          json?.error ||
          `Failed to fetch contact (HTTP ${res.status})`;
        setError(msg);
        setOpen(true); // ensure visible result
        track(
          "service_contact_reveal_failed",
          { serviceId, message: msg }
        );
        return;
      }

      setPayload(json);
      setOpen(true);
      track("service_contact_reveal", {
        serviceId,
      });
      emit("qs:service:contact:reveal", {
        serviceId,
        contact: json?.contact,
      });
    } catch (e: any) {
      const msg =
        "Network error. Please try again.";
      setError(msg);
      setOpen(true);
      track(
        "service_contact_reveal_failed",
        {
          serviceId,
          message: e?.message || msg,
        }
      );
    } finally {
      setLoading(false);
    }
  }, [serviceId, loading]);

  // a11y: keyboard trap + ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (
        e.key !== "Tab" ||
        !panelRef.current
      )
        return;

      const focusables =
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
      if (!focusables.length) return;

      const first = focusables.item(0);
      const last =
        focusables.item(
          focusables.length - 1
        );
      const active =
        document.activeElement as
          | HTMLElement
          | null;

      if (
        e.shiftKey &&
        active === first
      ) {
        e.preventDefault();
        last.focus();
      } else if (
        !e.shiftKey &&
        active === last
      ) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener(
      "keydown",
      onKey
    );
    return () =>
      window.removeEventListener(
        "keydown",
        onKey
      );
  }, [open]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev =
      document.body.style.overflow;
    document.body.style.overflow =
      "hidden";
    return () => {
      document.body.style.overflow =
        prev;
    };
  }, [open]);

  // Focus restore
  useEffect(() => {
    if (open) {
      const t = setTimeout(
        () => closeBtnRef.current?.focus(),
        15
      );
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => triggerRef.current?.focus(),
      0
    );
    return () => clearTimeout(t);
  }, [open]);

  const onBackdropClick = (
    e: MouseEvent<HTMLButtonElement>
  ) => {
    if (
      panelRef.current &&
      !panelRef.current.contains(
        e.target as Node
      )
    ) {
      setOpen(false);
    }
  };

  async function copyPhone() {
    const toCopy =
      payload?.contact?.phone || "";
    if (!toCopy) return;
    try {
      await navigator.clipboard.writeText(
        toCopy
      );
      setCopied(true);
      setTimeout(
        () => setCopied(false),
        1200
      );
      track(
        "service_contact_copy_phone",
        { serviceId }
      );
    } catch {
      /* ignore */
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
          "rounded-xl px-4 py-2 text-sm",
          "bg-black text-white dark:bg-white dark:text-black",
          "disabled:opacity-60",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-busy={
          loading ? "true" : "false"
        }
        aria-haspopup="dialog"
        aria-controls={modalId}
        aria-expanded={open}
        aria-label={buttonLabel}
      >
        {loading
          ? "Revealing…"
          : buttonLabel}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/40"
            aria-label="Close contact dialog"
            onClick={onBackdropClick}
          />
          <div
            id={modalId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${modalId}-title`}
            aria-describedby={
              descId
            }
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              ref={panelRef}
              className="w-full max-w-md rounded-2xl border bg-white p-5 shadow-lg dark:border-gray-800 dark:bg-gray-950"
            >
              <p
                id={descId}
                className="sr-only"
              >
                Provider contact
                details and quick
                actions.
              </p>

              {payload?.suggestLogin && (
                <div className="mb-3 rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-950/30 dark:text-yellow-300">
                  For safety, we
                  recommend logging in
                  first. You can still
                  proceed.
                </div>
              )}

              <div className="mb-2 flex items-center justify-between">
                <h3
                  id={`${modalId}-title`}
                  className="font-semibold text-gray-900 dark:text-gray-100"
                >
                  Provider Contact
                </h3>
                <button
                  ref={closeBtnRef}
                  onClick={() =>
                    setOpen(false)
                  }
                  type="button"
                  className="rounded-md border px-2 py-1 text-sm hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
                >
                  Close
                </button>
              </div>

              {error ? (
                <div
                  className="text-sm text-red-600 dark:text-red-400"
                  role="alert"
                  aria-live="polite"
                >
                  {error}
                </div>
              ) : (
                <>
                  <div className="space-y-2 text-sm text-gray-800 dark:text-gray-200">
                    <div>
                      <span className="font-medium">
                        Name:
                      </span>{" "}
                      {name}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        Phone:
                      </span>
                      <span>
                        {phone}
                      </span>
                      {payload
                        ?.contact
                        ?.phone && (
                        <button
                          onClick={
                            copyPhone
                          }
                          type="button"
                          className="ml-2 rounded border px-2 py-0.5 text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                          title="Copy to clipboard"
                        >
                          {copied
                            ? "Copied!"
                            : "Copy"}
                        </button>
                      )}
                    </div>
                    <div>
                      <span className="font-medium">
                        Location:
                      </span>{" "}
                      {
                        providerLocation
                      }
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    {waLink && (
                      <IconButton
                        icon="message"
                        variant="outline"
                        labelText="Message"
                        srLabel="Message on WhatsApp"
                        onClick={() => {
                          try {
                            window.open(
                              waLink,
                              "_blank",
                              "noopener,noreferrer"
                            );
                            track(
                              "service_contact_whatsapp_click",
                              {
                                serviceId,
                              }
                            );
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
                        srLabel="Call provider"
                        onClick={() => {
                          try {
                            window.location.href =
                              telLink;
                            track(
                              "service_contact_call_click",
                              {
                                serviceId,
                              }
                            );
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
                      srLabel="Share service"
                      onClick={() =>
                        void share()
                      }
                    />
                    <IconButton
                      icon="heart"
                      variant="outline"
                      labelText={
                        saved
                          ? "Favorited"
                          : "Favorite"
                      }
                      srLabel={
                        saved
                          ? "Unfavorite service"
                          : "Favorite service"
                      }
                      aria-pressed={
                        saved
                      }
                      onClick={
                        toggleSave
                      }
                    />
                    <button
                      onClick={() =>
                        setOpen(false)
                      }
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
