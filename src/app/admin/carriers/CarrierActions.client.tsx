"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type CarrierStatus = "OFFLINE" | "AVAILABLE" | "ON_TRIP";
type PlanTier = "BASIC" | "GOLD" | "PLATINUM";
type VerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";

type Current = {
  status: CarrierStatus;
  planTier: PlanTier;
  verificationStatus: VerificationStatus;

  suspendedUntil: string | null;
  bannedAt: string | null;
  bannedReason: string | null;
};

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

function toLocalDatetimeValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function isoFromLocalDatetimeValue(v: string) {
  const s = (v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  const ms = d.getTime();
  return Number.isFinite(ms) ? d.toISOString() : null;
}

function isSuspendedNow(suspendedUntil: string | null) {
  if (!suspendedUntil) return false;
  const ms = new Date(suspendedUntil).getTime();
  return Number.isFinite(ms) ? ms > Date.now() : false;
}

export default function CarrierActions({
  carrierId,
  current,
}: {
  carrierId: string;
  current: Current;
}) {
  const router = useRouter();

  const [tier, setTier] = useState<PlanTier>(current.planTier);
  const [verification, setVerification] = useState<VerificationStatus>(current.verificationStatus);

  const [banReason, setBanReason] = useState<string>(current.bannedReason || "");
  const [suspendUntilLocal, setSuspendUntilLocal] = useState<string>(toLocalDatetimeValue(current.suspendedUntil));

  const [busy, setBusy] = useState<string | null>(null);

  const bannedNow = Boolean(current.bannedAt);
  const suspendedNow = isSuspendedNow(current.suspendedUntil);

  const panelBtnCls =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const selectCls =
    "w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm transition focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const inputCls =
    "w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm transition placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const smallBtn =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold border border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const disabled = useMemo(() => busy != null, [busy]);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const setTierApi = useCallback(async () => {
    if (disabled) return;
    setBusy("tier");
    toast.dismiss();

    try {
      const { ok, status, json } = await postJson(`/api/admin/carriers/${encodeURIComponent(carrierId)}/tier`, {
        planTier: tier,
      });

      if (!ok) {
        const msg =
          json?.error ||
          (status === 404
            ? "Tier endpoint is not enabled yet."
            : status === 401
              ? "Unauthorized."
              : "Failed to set tier.");
        toast.error(msg);
        return;
      }

      toast.success("Tier updated");
      refresh();
    } finally {
      setBusy(null);
    }
  }, [carrierId, tier, disabled, refresh]);

  const setVerificationApi = useCallback(async () => {
    if (disabled) return;
    setBusy("verify");
    toast.dismiss();

    try {
      const { ok, status, json } = await postJson(`/api/admin/carriers/${encodeURIComponent(carrierId)}/verify`, {
        verificationStatus: verification,
      });

      if (!ok) {
        const msg =
          json?.error ||
          (status === 404
            ? "Verification endpoint is not enabled yet."
            : status === 401
              ? "Unauthorized."
              : "Failed to set verification.");
        toast.error(msg);
        return;
      }

      toast.success("Verification updated");
      refresh();
    } finally {
      setBusy(null);
    }
  }, [carrierId, verification, disabled, refresh]);

  const suspendApi = useCallback(async (untilIso: string | null) => {
    if (disabled) return;
    setBusy("suspend");
    toast.dismiss();

    try {
      const { ok, status, json } = await postJson("/api/admin/carriers/suspend", {
        carrierId,
        suspendedUntil: untilIso,
      });

      if (!ok) {
        const msg =
          json?.error ||
          (status === 404
            ? "Suspend endpoint is not enabled yet."
            : status === 401
              ? "Unauthorized."
              : "Failed to update suspension.");
        toast.error(msg);
        return;
      }

      toast.success(untilIso ? "Carrier suspended" : "Carrier unsuspended");
      refresh();
    } finally {
      setBusy(null);
    }
  }, [carrierId, disabled, refresh]);

  const banApi = useCallback(async (ban: boolean) => {
    if (disabled) return;
    setBusy("ban");
    toast.dismiss();

    const payload = ban
      ? {
          carrierId,
          action: "ban",
          banned: true,
          bannedAt: new Date().toISOString(),
          bannedReason: (banReason || "").trim() || null,
        }
      : {
          carrierId,
          action: "unban",
          banned: false,
          bannedAt: null,
          bannedReason: null,
        };

    try {
      const { ok, status, json } = await postJson("/api/admin/carriers/ban", payload);

      if (!ok) {
        const msg =
          json?.error ||
          (status === 404
            ? "Ban endpoint is not enabled yet."
            : status === 401
              ? "Unauthorized."
              : "Failed to update ban state.");
        toast.error(msg);
        return;
      }

      toast.success(ban ? "Carrier banned" : "Carrier unbanned");
      refresh();
    } finally {
      setBusy(null);
    }
  }, [carrierId, banReason, disabled, refresh]);

  const quickSuspend = useCallback((minutes: number) => {
    const until = new Date(Date.now() + minutes * 60_000).toISOString();
    void suspendApi(until);
  }, [suspendApi]);

  const applySuspendFromInput = useCallback(() => {
    const iso = isoFromLocalDatetimeValue(suspendUntilLocal);
    if (!iso) {
      toast.error("Pick a valid suspend-until time.");
      return;
    }
    void suspendApi(iso);
  }, [suspendUntilLocal, suspendApi]);

  return (
    <details className="inline-block text-left">
      <summary
        className={panelBtnCls}
        aria-label="Open carrier actions"
      >
        Actions
      </summary>

      <div className="mt-2 w-[320px] max-w-[90vw] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft">
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Carrier actions
        </div>
        <div className="mt-1 text-sm font-extrabold text-[var(--text)]">
          {carrierId}
        </div>

        <div className="mt-3 space-y-4">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-[var(--text)]">Ban</div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">
                  {bannedNow ? "Carrier is currently banned." : "Ban disables carrier actions immediately."}
                </div>
              </div>
              <button
                type="button"
                className={smallBtn}
                disabled={disabled}
                aria-disabled={disabled}
                onClick={() => void banApi(!bannedNow)}
                title={bannedNow ? "Unban carrier" : "Ban carrier"}
              >
                {busy === "ban" ? "Working…" : bannedNow ? "Unban" : "Ban"}
              </button>
            </div>

            {!bannedNow ? (
              <div className="mt-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Reason (optional)
                </label>
                <input
                  className={inputCls}
                  placeholder="Reason shown to admins"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  disabled={disabled}
                />
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-[var(--text)]">Suspend</div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">
                  {suspendedNow
                    ? "Carrier is currently suspended."
                    : "Suspend until a date/time. Use quick presets or pick a specific time."}
                </div>
              </div>

              {suspendedNow ? (
                <button
                  type="button"
                  className={smallBtn}
                  disabled={disabled}
                  aria-disabled={disabled}
                  onClick={() => void suspendApi(null)}
                >
                  {busy === "suspend" ? "Working…" : "Unsuspend"}
                </button>
              ) : null}
            </div>

            {!suspendedNow ? (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={smallBtn}
                    disabled={disabled}
                    aria-disabled={disabled}
                    onClick={() => quickSuspend(60)}
                    title="Suspend for 1 hour"
                  >
                    1h
                  </button>
                  <button
                    type="button"
                    className={smallBtn}
                    disabled={disabled}
                    aria-disabled={disabled}
                    onClick={() => quickSuspend(6 * 60)}
                    title="Suspend for 6 hours"
                  >
                    6h
                  </button>
                  <button
                    type="button"
                    className={smallBtn}
                    disabled={disabled}
                    aria-disabled={disabled}
                    onClick={() => quickSuspend(24 * 60)}
                    title="Suspend for 24 hours"
                  >
                    24h
                  </button>
                  <button
                    type="button"
                    className={smallBtn}
                    disabled={disabled}
                    aria-disabled={disabled}
                    onClick={() => quickSuspend(7 * 24 * 60)}
                    title="Suspend for 7 days"
                  >
                    7d
                  </button>
                </div>

                <div className="mt-3">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Suspend until
                  </label>
                  <input
                    type="datetime-local"
                    className={inputCls}
                    value={suspendUntilLocal}
                    onChange={(e) => setSuspendUntilLocal(e.target.value)}
                    disabled={disabled}
                  />
                </div>

                <div className="mt-2">
                  <button
                    type="button"
                    className={smallBtn}
                    disabled={disabled}
                    aria-disabled={disabled}
                    onClick={applySuspendFromInput}
                  >
                    {busy === "suspend" ? "Working…" : "Suspend"}
                  </button>
                </div>
              </>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 shadow-sm">
            <div className="text-sm font-semibold text-[var(--text)]">Tier</div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">
              Higher tiers rank above lower tiers in carrier discovery.
            </div>

            <div className="mt-3 flex items-center gap-2">
              <select
                className={selectCls}
                value={tier}
                onChange={(e) => setTier(e.target.value as PlanTier)}
                disabled={disabled}
                aria-label="Plan tier"
              >
                <option value="BASIC">BASIC</option>
                <option value="GOLD">GOLD</option>
                <option value="PLATINUM">PLATINUM</option>
              </select>

              <button
                type="button"
                className={smallBtn}
                disabled={disabled}
                aria-disabled={disabled}
                onClick={() => void setTierApi()}
              >
                {busy === "tier" ? "Saving…" : "Save"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 shadow-sm">
            <div className="text-sm font-semibold text-[var(--text)]">Verification</div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">
              Used to track whether the carrier’s evidence has been reviewed.
            </div>

            <div className="mt-3 flex items-center gap-2">
              <select
                className={selectCls}
                value={verification}
                onChange={(e) => setVerification(e.target.value as VerificationStatus)}
                disabled={disabled}
                aria-label="Verification status"
              >
                <option value="UNVERIFIED">UNVERIFIED</option>
                <option value="PENDING">PENDING</option>
                <option value="VERIFIED">VERIFIED</option>
                <option value="REJECTED">REJECTED</option>
              </select>

              <button
                type="button"
                className={smallBtn}
                disabled={disabled}
                aria-disabled={disabled}
                onClick={() => void setVerificationApi()}
              >
                {busy === "verify" ? "Saving…" : "Save"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 text-xs text-[var(--text-muted)]">
            Note: status changes (OFFLINE/AVAILABLE/ON_TRIP) are carrier-controlled through self-service. Enforcement overrides carrier actions when applied.
          </div>
        </div>
      </div>
    </details>
  );
}
