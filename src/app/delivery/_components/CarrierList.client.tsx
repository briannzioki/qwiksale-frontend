"use client";

import { useMemo } from "react";

export type CarrierCard = {
  id: string;
  displayName: string;
  planTier: "BASIC" | "GOLD" | "PLATINUM" | string;
  status: "OFFLINE" | "AVAILABLE" | "ON_TRIP" | string;
  distanceMeters: number | null;
  lastSeenAt: string | null;
  isStale?: boolean;
  vehicleType?: string | null;
  coords?: { lat: number; lng: number } | null;
  headline?: string | null;
  rating?: number | null;
  completedTrips?: number | null;
};

function tierRank(tier: string) {
  const t = String(tier || "").toUpperCase();
  if (t === "PLATINUM") return 0;
  if (t === "GOLD") return 1;
  return 2; // BASIC/default
}

function parseDateMs(raw: string | null) {
  if (!raw) return null;
  const d = new Date(raw);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function computeStale(lastSeenAt: string | null, liveCutoffSeconds = 90) {
  const ms = parseDateMs(lastSeenAt);
  if (ms == null) return true;
  return Date.now() - ms > liveCutoffSeconds * 1000;
}

function initials(name: string) {
  const s = (name || "").trim();
  if (!s) return "C";
  const parts = s.split(/\s+/).filter(Boolean);
  if (!parts.length) return "C";
  const a = parts[0]?.[0] ?? "C";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (a + b).toUpperCase();
}

export default function CarrierList({
  carriers,
  loading,
  error,
  onRequest,
  renderMeta,
}: {
  carriers: CarrierCard[];
  loading?: boolean;
  error?: string | null;
  onRequest: (c: CarrierCard) => void;
  renderMeta?: (c: CarrierCard) => React.ReactNode;
}) {
  const ranked = useMemo(() => {
    const list = Array.isArray(carriers) ? [...carriers] : [];
    for (const c of list) {
      (c as any).isStale = typeof c.isStale === "boolean" ? c.isStale : computeStale(c.lastSeenAt, 90);
    }

    list.sort((a, b) => {
      const ta = tierRank(a.planTier);
      const tb = tierRank(b.planTier);
      if (ta !== tb) return ta - tb;

      const da = typeof a.distanceMeters === "number" ? a.distanceMeters : Number.POSITIVE_INFINITY;
      const db = typeof b.distanceMeters === "number" ? b.distanceMeters : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;

      // freshness: most recent first
      const sa = parseDateMs(a.lastSeenAt) ?? 0;
      const sb = parseDateMs(b.lastSeenAt) ?? 0;
      return sb - sa;
    });

    return list;
  }, [carriers]);

  const emptyText = loading
    ? "Loading carriers…"
    : error
      ? error
      : "No carriers to show.";

  if (!ranked.length) {
    return (
      <div
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-4 text-sm text-[var(--text-muted)]"
        role="status"
        aria-live="polite"
      >
        {emptyText}
      </div>
    );
  }

  return (
    <ul className="space-y-2" aria-label="Carrier list">
      {ranked.map((c) => {
        const tier = String(c.planTier || "BASIC").toUpperCase();
        const status = String(c.status || "AVAILABLE").toUpperCase();

        const statusLabel =
          status === "AVAILABLE" ? "Available" : status === "ON_TRIP" ? "On trip" : "Offline";

        const canRequest = status === "AVAILABLE";

        const stale =
          typeof c.isStale === "boolean" ? c.isStale : computeStale(c.lastSeenAt, 90);

        const tierBadge =
          tier === "PLATINUM"
            ? "border border-[var(--border-subtle)] bg-[var(--bg-subtle)]"
            : tier === "GOLD"
              ? "border border-[var(--border-subtle)] bg-[var(--bg-subtle)]"
              : "border border-[var(--border-subtle)] bg-[var(--bg)]";

        return (
          <li
            key={c.id}
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 shadow-sm transition hover:bg-[var(--bg-subtle)] sm:p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={[
                    "grid h-10 w-10 place-content-center rounded-2xl",
                    "border border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
                    "text-sm font-extrabold text-[var(--text)] shadow-sm",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  {initials(c.displayName)}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-sm font-extrabold text-[var(--text)]">
                      {c.displayName || "Carrier"}
                    </div>

                    <span
                      className={[
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-[var(--text)]",
                        tierBadge,
                      ].join(" ")}
                      aria-label={`Tier ${tier}`}
                      title={`Tier ${tier}`}
                    >
                      {tier}
                    </span>

                    <span
                      className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text)]"
                      aria-label={`Status ${statusLabel}`}
                      title={`Status ${statusLabel}`}
                    >
                      {statusLabel}
                    </span>

                    {stale ? (
                      <span
                        className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text)]"
                        aria-label="Stale location"
                        title="Stale location"
                      >
                        Stale
                      </span>
                    ) : null}
                  </div>

                  {c.headline ? (
                    <div className="mt-1 line-clamp-2 text-sm text-[var(--text-muted)]">
                      {c.headline}
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-[var(--text-muted)]">
                      Ready to help with delivery requests.
                    </div>
                  )}

                  {renderMeta ? renderMeta(c) : null}
                </div>
              </div>

              <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                <button
                  type="button"
                  className={canRequest ? "btn-gradient-primary" : "btn-outline"}
                  onClick={() => onRequest(c)}
                  disabled={!canRequest}
                  aria-disabled={!canRequest}
                  title={!canRequest ? "Carrier is not available right now" : "Request this carrier"}
                >
                  Request
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
