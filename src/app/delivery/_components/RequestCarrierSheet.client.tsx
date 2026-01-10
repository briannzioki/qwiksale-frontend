"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

export type DeliveryRequestDraft = {
  carrierId: string;
  carrierName: string;
  origin: { lat: number; lng: number } | null;
  near: "me" | "store";
  productId: string | null;
  note: string | null;
};

type RequestType = "DELIVERY" | "CONFIRM_AVAILABILITY";

async function postJson(url: string, body: any) {
  const r = await fetch(url, {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}

function fmtLatLng(origin: { lat: number; lng: number } | null) {
  if (!origin) return "Not set";
  const lat = Number(origin.lat);
  const lng = Number(origin.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "Not set";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export default function RequestCarrierSheet({
  open,
  draft,
  onClose,
  onCreated,
}: {
  open: boolean;
  draft: DeliveryRequestDraft | null;
  onClose: () => void;
  onCreated?: () => void | Promise<void>;
}) {
  const [type, setType] = useState<RequestType>("DELIVERY");
  const [details, setDetails] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setType("DELIVERY");
    setDetails("");
    // focus first field for a11y
    window.setTimeout(() => firstFieldRef.current?.focus(), 50);
  }, [open]);

  const disabledReason = useMemo(() => {
    if (!draft) return "Missing request context";
    if (!draft.carrierId) return "Missing carrier";
    if (!draft.origin) return "Missing pickup location";
    if (draft.near === "store" && !draft.productId) return "Missing product context";
    return null;
  }, [draft]);

  const submit = useCallback(async () => {
    if (!draft) return;
    if (disabledReason) {
      toast.error(disabledReason);
      return;
    }
    if (busy) return;

    setBusy(true);
    toast.dismiss();

    try {
      const payload = {
        type,
        requesterNote: details.trim() || draft.note || null,
        carrierId: draft.carrierId,
        pickup: {
          lat: draft.origin?.lat ?? null,
          lng: draft.origin?.lng ?? null,
          near: draft.near,
          ...(draft.near === "store" && draft.productId ? { productId: draft.productId } : {}),
        },
      };

      const { ok, status, json } = await postJson("/api/delivery/requests", payload);

      if (!ok) {
        const msg =
          json?.error ||
          (status === 401
            ? "You must be signed in to create a request."
            : status === 404
              ? "Delivery requests endpoint is not enabled yet."
              : "Failed to create request.");
        toast.error(msg);
        return;
      }

      toast.success("Request sent");
      onClose();
      await onCreated?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create request.");
    } finally {
      setBusy(false);
    }
  }, [draft, type, details, onClose, onCreated, busy, disabledReason]);

  if (!open || !draft) return null;

  return (
    <div
      className="fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label="Request carrier"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[var(--bg)]/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close request sheet"
      />

      <div
        ref={dialogRef}
        className={[
          "absolute right-0 top-0 h-full w-[min(520px,92vw)]",
          "border-l border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-soft",
          "p-4 sm:p-5",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Delivery request
            </p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight text-[var(--text)]">
              Request {draft.carrierName || "carrier"}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Pickup pin: <span className="font-semibold text-[var(--text)]">{fmtLatLng(draft.origin)}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={[
              "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-1.5",
              "text-sm font-semibold text-[var(--text)] shadow-sm transition",
              "hover:bg-[var(--bg-subtle)] active:scale-[.99]",
              "focus-visible:outline-none focus-visible:ring-2 ring-focus",
            ].join(" ")}
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <fieldset className="space-y-2" aria-label="Request type">
            <legend className="text-sm font-semibold text-[var(--text)]">Request type</legend>

            <label
              className="flex cursor-pointer items-start gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 text-[var(--text)] shadow-sm"
            >
              <input
                type="radio"
                name="req-type"
                value="DELIVERY"
                checked={type === "DELIVERY"}
                onChange={() => setType("DELIVERY")}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-extrabold text-[var(--text)]">DELIVERY</span>
                <span className="block text-xs text-[var(--text-muted)]">
                  Create a delivery request for pickup and dropoff coordination.
                </span>
              </span>
            </label>

            <label
              className="flex cursor-pointer items-start gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 text-[var(--text)] shadow-sm"
            >
              <input
                type="radio"
                name="req-type"
                value="CONFIRM_AVAILABILITY"
                checked={type === "CONFIRM_AVAILABILITY"}
                onChange={() => setType("CONFIRM_AVAILABILITY")}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-extrabold text-[var(--text)]">
                  CONFIRM_AVAILABILITY
                </span>
                <span className="block text-xs text-[var(--text-muted)]">
                  Ask the carrier to confirm they can take the job before you share full details.
                </span>
              </span>
            </label>
          </fieldset>

          <div className="space-y-2">
            <label htmlFor="req-details" className="text-sm font-semibold text-[var(--text)]">
              Notes (optional)
            </label>
            <textarea
              id="req-details"
              ref={firstFieldRef}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={5}
              placeholder="Example: fragile item, pickup time window, cash on delivery, confirm first…"
              className={[
                "w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3",
                "text-sm text-[var(--text)] shadow-sm transition",
                "placeholder:text-[var(--text-muted)]",
                "focus-visible:outline-none focus-visible:ring-2 ring-focus",
              ].join(" ")}
            />
            <p className="text-xs text-[var(--text-muted)]">
              Keep it short. You can share more details after the carrier responds.
            </p>
          </div>

          {disabledReason ? (
            <div
              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 text-sm"
              role="status"
              aria-live="polite"
            >
              <span className="font-semibold text-[var(--text)]">Can’t send yet.</span>{" "}
              <span className="text-[var(--text-muted)]">{disabledReason}</span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-gradient-primary"
              onClick={() => void submit()}
              disabled={busy || Boolean(disabledReason)}
              aria-disabled={busy || Boolean(disabledReason)}
            >
              {busy ? "Sending…" : "Send request"}
            </button>

            <button
              type="button"
              className={[
                "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-4 py-2.5",
                "text-sm font-semibold text-[var(--text)] shadow-sm transition",
                "hover:bg-[var(--bg-subtle)] active:scale-[.99]",
                "focus-visible:outline-none focus-visible:ring-2 ring-focus",
              ].join(" ")}
              onClick={onClose}
            >
              Cancel
            </button>
          </div>

          <div className="text-xs text-[var(--text-muted)]">
            This feature enforces carrier availability server-side. If a carrier is suspended or banned,
            the API will reject requests cleanly.
          </div>
        </div>
      </div>
    </div>
  );
}
