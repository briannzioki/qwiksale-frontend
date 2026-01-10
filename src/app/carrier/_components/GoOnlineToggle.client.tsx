"use client";

import { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";

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

function normalizeStatus(s: string) {
  return String(s || "").toUpperCase();
}

type Props = {
  status: string;
  disabledReason?: string | null;

  /**
   * Next.js TS plugin expects function props in client files to be named like actions.
   * Use this in new call-sites.
   */
  onUpdatedAction?: (nextStatus: string) => void;
} & Record<string, unknown>; // allows legacy props (e.g. onUpdated) without typing them

export default function GoOnlineToggle(props: Props) {
  const { status, disabledReason, onUpdatedAction } = props;
  const [busy, setBusy] = useState(false);

  const st = normalizeStatus(status);
  const isOnline = st === "AVAILABLE";

  const label = useMemo(() => {
    if (st === "ON_TRIP") return "On trip";
    return isOnline ? "Online" : "Offline";
  }, [st, isOnline]);

  const canToggle = !busy && !disabledReason && st !== "ON_TRIP";

  const notifyUpdated = useCallback(
    (nextStatus: string) => {
      // Preferred prop name
      if (typeof onUpdatedAction === "function") {
        onUpdatedAction(nextStatus);
        return;
      }

      // Back-compat: allow older call-sites passing `onUpdated`
      const legacy = (props as any)?.onUpdated;
      if (typeof legacy === "function") {
        legacy(nextStatus);
      }
    },
    [onUpdatedAction, props],
  );

  const toggle = useCallback(async () => {
    if (!canToggle) {
      if (disabledReason) toast.error(disabledReason);
      return;
    }

    setBusy(true);
    toast.dismiss();

    const next = isOnline ? "OFFLINE" : "AVAILABLE";

    try {
      const { ok, status: code, json } = await postJson("/api/carrier/me/status", {
        status: next,
      });

      if (!ok) {
        const msg =
          json?.error ||
          (code === 404
            ? "Carrier status endpoint is not enabled yet."
            : code === 401
              ? "You must be signed in."
              : "Failed to update status.");
        toast.error(msg);
        return;
      }

      toast.success(next === "AVAILABLE" ? "You are now online" : "You are now offline");
      notifyUpdated(next);
    } catch (e: any) {
      toast.error(e?.message || "Failed to update status.");
    } finally {
      setBusy(false);
    }
  }, [canToggle, disabledReason, isOnline, notifyUpdated]);

  return (
    <div className="space-y-2" aria-label="Go online toggle">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-[var(--text)]">
          Status: <span className="font-extrabold">{label}</span>
        </div>

        <button
          type="button"
          onClick={() => void toggle()}
          disabled={!canToggle}
          aria-disabled={!canToggle}
          className={isOnline ? "btn-outline" : "btn-gradient-primary"}
          title={
            disabledReason ||
            (st === "ON_TRIP" ? "You cannot change status while on a trip." : undefined)
          }
        >
          {busy ? "Updating…" : isOnline ? "Go offline" : "Go online"}
        </button>
      </div>

      {disabledReason ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 text-xs text-[var(--text-muted)]">
          {disabledReason}
        </div>
      ) : null}
    </div>
  );
}
