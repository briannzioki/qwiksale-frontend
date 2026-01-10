"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import GoOnlineToggle from "./GoOnlineToggle.client";
import LocationTracker from "./LocationTracker.client";

type Carrier = {
  id: string;
  userId: string;

  phone: string | null;
  vehicleType: string | null;
  vehiclePlate: string | null;
  vehiclePhotoKeys: string[];
  docPhotoKey: string | null;
  stationLat: number | null;
  stationLng: number | null;

  planTier: string;
  verificationStatus: string;
  status: string;

  lastSeenAt: string | null;
  lastLat: number | null;
  lastLng: number | null;

  suspendedUntil: string | null;
  bannedAt: string | null;
  bannedReason: string | null;
};

type Enforcement = {
  banned: boolean;
  suspended: boolean;
  suspendedUntil: string | null;
  bannedAt: string | null;
  bannedReason: string | null;
};

type RequestPreview = {
  id: string;
  type: string;
  status: string;
  createdAt: string;
};

async function fetchJson(url: string) {
  const r = await fetch(url, {
    method: "GET",
    cache: "no-store",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "cache-control": "no-store",
    },
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}

function upper(v: string | null | undefined, fallback: string) {
  const s = (v ?? "").toString().trim();
  return s ? s.toUpperCase() : fallback;
}

function fmtWhen(ts: string | null) {
  if (!ts) return "Unknown";
  const d = new Date(ts);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return "Unknown";
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 5) return "Just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function isSuspendedNow(suspendedUntil: string | null) {
  if (!suspendedUntil) return false;
  const ms = new Date(suspendedUntil).getTime();
  return Number.isFinite(ms) ? ms > Date.now() : false;
}

function liveCutoff(lastSeenAt: string | null, cutoffSeconds = 90) {
  if (!lastSeenAt) return false;
  const ms = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms <= cutoffSeconds * 1000;
}

function fmtIsoShort(iso: string | null) {
  if (!iso) return "Unknown";
  try {
    return iso.slice(0, 19).replace("T", " ");
  } catch {
    return iso;
  }
}

export default function CarrierDashboardClient({
  initialCarrier,
  enforcement,
  user,
}: {
  initialCarrier: Carrier;
  enforcement: Enforcement;
  user: { id: string; name: string | null; email: string | null };
}) {
  const [carrier, setCarrier] = useState<Carrier>(initialCarrier);
  const [loading, setLoading] = useState(false);

  const [requests, setRequests] = useState<RequestPreview[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  const tier = upper(carrier.planTier, "BASIC");
  const verification = upper(carrier.verificationStatus, "UNVERIFIED");
  const status = upper(carrier.status, "OFFLINE");

  const suspendedNow = useMemo(
    () => enforcement.suspended || isSuspendedNow(carrier.suspendedUntil),
    [enforcement.suspended, carrier.suspendedUntil],
  );

  const bannedNow = useMemo(
    () => enforcement.banned || Boolean(carrier.bannedAt),
    [enforcement.banned, carrier.bannedAt],
  );

  const enforcementDisabledReason = useMemo(() => {
    if (bannedNow) return "Your carrier profile is banned.";
    if (suspendedNow) return "Your carrier profile is suspended.";
    return null;
  }, [bannedNow, suspendedNow]);

  const isOnline = status === "AVAILABLE";
  const isLive = liveCutoff(carrier.lastSeenAt, 90);

  const refreshMe = useCallback(async () => {
    setLoading(true);
    try {
      const { ok, status: code, json } = await fetchJson("/api/carrier/me");
      if (!ok) {
        if (code !== 404) toast.error(json?.error || "Failed to refresh carrier profile.");
        return;
      }
      const next = (json?.carrier ?? json) as any;
      if (next && typeof next === "object") {
        setCarrier((prev) => ({ ...prev, ...next }));
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const { ok, status: code, json } = await fetchJson("/api/carrier/requests?limit=6");
      if (!ok) {
        if (code !== 404) toast.error(json?.error || "Failed to load requests.");
        setRequests([]);
        return;
      }

      const list =
        (Array.isArray(json?.items) && json.items) ||
        (Array.isArray(json?.requests) && json.requests) ||
        (Array.isArray(json) && json) ||
        [];

      const mapped: RequestPreview[] = (list as any[])
        .map((r: any) => {
          const id = String(r?.id ?? "").trim();
          if (!id) return null;
          return {
            id,
            type: String(r?.type ?? "DELIVERY"),
            status: String(r?.status ?? "PENDING"),
            createdAt: String(r?.createdAt ?? ""),
          } as RequestPreview;
        })
        .filter(Boolean) as RequestPreview[];

      setRequests(mapped);
    } catch {
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const headline = useMemo(() => {
    if (bannedNow) return "Banned";
    if (suspendedNow) return "Suspended";
    if (verification === "REJECTED") return "Verification rejected";
    if (verification === "PENDING") return "Verification pending";
    if (verification === "UNVERIFIED") return "Unverified";
    return "Ready";
  }, [bannedNow, suspendedNow, verification]);

  const heroBtn = [
    "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold sm:text-sm",
    "border-white/20 bg-white/10 text-white shadow-sm transition",
    "hover:bg-white/15 active:scale-[.99]",
    "focus-visible:outline-none focus-visible:ring-2 ring-focus",
    "disabled:opacity-60 disabled:cursor-not-allowed",
  ].join(" ");

  const heroChip = [
    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
    "border-white/20 bg-white/10 text-white",
  ].join(" ");

  const statusChipText =
    status === "AVAILABLE" ? "Online" : status === "ON_TRIP" ? "On trip" : "Offline";

  return (
    <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6" aria-label="Carrier dashboard">
      <header
        className={[
          "relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] shadow-soft",
          "bg-gradient-to-r from-[var(--brand-navy)] via-[var(--brand-green)] to-[var(--brand-blue)]",
          "p-4 text-white sm:p-6",
        ].join(" ")}
      >
        <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" aria-hidden />

        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Carrier dashboard</p>
            <h1 className="mt-1 text-xl font-extrabold tracking-tight text-white sm:text-2xl">
              {carrier.vehicleType ? `${carrier.vehicleType} carrier` : "Carrier"}
            </h1>
            <p className="mt-2 text-sm text-white/85">
              Manage your availability, location sharing, and requests.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/dashboard" prefetch={false} className={heroBtn}>
              User dashboard
            </Link>
            <Link href="/carrier/requests" prefetch={false} className={heroBtn}>
              Requests
            </Link>
            <button type="button" onClick={() => void refreshMe()} className={heroBtn} disabled={loading} aria-disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          <span className={heroChip} aria-label={`Status ${status}`}>
            {statusChipText}
          </span>
          <span className={heroChip}>Tier: {tier}</span>
          <span className={heroChip}>Verification: {verification}</span>
          <span className={heroChip}>Last seen: {fmtWhen(carrier.lastSeenAt)}</span>
          <span className={heroChip}>{isLive ? "Live" : "Stale"}</span>
        </div>

        {(bannedNow || suspendedNow) ? (
          <div className="relative mt-4 rounded-2xl border border-white/20 bg-white/10 p-4 shadow-sm" role="status" aria-live="polite">
            <div className="text-sm font-extrabold text-white">
              {bannedNow ? "Your carrier profile is banned." : "Your carrier profile is suspended."}
            </div>
            <div className="mt-1 text-sm text-white/85">
              {bannedNow ? (
                <>
                  Reason:{" "}
                  <span className="font-semibold text-white">
                    {carrier.bannedReason || enforcement.bannedReason || "Not provided"}
                  </span>
                  .
                </>
              ) : (
                <>
                  Suspended until{" "}
                  <span className="font-semibold text-white">
                    {fmtIsoShort(carrier.suspendedUntil || enforcement.suspendedUntil)}
                  </span>
                  .
                </>
              )}{" "}
              You can view your dashboard, but online actions are disabled.
            </div>
          </div>
        ) : null}
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3" aria-label="Carrier quick actions">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-5">
          <h2 className="text-sm font-semibold text-[var(--text)]">Availability</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Go online to receive requests. While online, location sharing is enabled.
          </p>

          <div className="mt-3">
            <GoOnlineToggle
              status={status}
              disabledReason={
                enforcementDisabledReason || (status === "ON_TRIP" ? "You are currently marked as on a trip." : null)
              }
              onUpdated={(nextStatus) => {
                setCarrier((prev) => ({ ...prev, status: nextStatus }));
              }}
            />
          </div>

          <div className="mt-4">
            <LocationTracker
              enabled={isOnline}
              disabledReason={enforcementDisabledReason}
              onPing={(patch) => {
                setCarrier((prev) => ({
                  ...prev,
                  lastLat: typeof patch.lastLat === "number" ? patch.lastLat : prev.lastLat,
                  lastLng: typeof patch.lastLng === "number" ? patch.lastLng : prev.lastLng,
                  lastSeenAt: patch.lastSeenAt || prev.lastSeenAt,
                }));
              }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-5">
          <h2 className="text-sm font-semibold text-[var(--text)]">Profile</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Keep your details accurate for verification and support.
          </p>

          <div className="mt-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[var(--text-muted)]">Phone</span>
              <span className="font-semibold text-[var(--text)]">{carrier.phone || "Not set"}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[var(--text-muted)]">Plate</span>
              <span className="font-semibold text-[var(--text)]">{carrier.vehiclePlate || "Not set"}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[var(--text-muted)]">Station</span>
              <span className="font-semibold text-[var(--text)]">
                {carrier.stationLat != null && carrier.stationLng != null
                  ? `${carrier.stationLat.toFixed(5)}, ${carrier.stationLng.toFixed(5)}`
                  : "Not set"}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[var(--text-muted)]">Headline</span>
              <span className="font-semibold text-[var(--text)]">{headline}</span>
            </div>
          </div>

          <div className="mt-4 text-xs text-[var(--text-muted)]">
            Signed in as{" "}
            <span className="font-semibold text-[var(--text)]">{user.name || user.email || "user"}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-soft sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text)]">Recent requests</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Preview the newest requests assigned to you.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadRequests()}
              className={[
                "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2",
                "text-sm font-semibold text-[var(--text)] shadow-sm transition",
                "hover:bg-[var(--bg-subtle)] active:scale-[.99]",
                "focus-visible:outline-none focus-visible:ring-2 ring-focus",
              ].join(" ")}
              disabled={requestsLoading}
              aria-disabled={requestsLoading}
            >
              {requestsLoading ? "Loading…" : "Reload"}
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {!requests.length ? (
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 text-sm text-[var(--text-muted)]">
                {requestsLoading ? "Loading requests…" : "No recent requests yet, or the requests API is not enabled."}
              </div>
            ) : (
              <ul className="space-y-2">
                {requests.slice(0, 6).map((r) => (
                  <li key={r.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold text-[var(--text)]">{r.type}</div>
                        <div className="mt-1 text-xs text-[var(--text-muted)]">
                          {r.status} • {r.createdAt ? r.createdAt.slice(0, 19).replace("T", " ") : "Unknown time"}
                        </div>
                      </div>
                      <span className="chip rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-xs font-semibold text-[var(--text)]">
                        {r.id}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4">
            <Link href="/carrier/requests" prefetch={false} className="btn-outline">
              View all requests
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
