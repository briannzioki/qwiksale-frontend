"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

type PingPatch = {
  lastLat?: number | null;
  lastLng?: number | null;
  lastSeenAt?: string | null;
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

function fmtWhen(ts: number | null) {
  if (!ts) return "Never";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return "Just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

type Props = {
  enabled: boolean;
  disabledReason?: string | null;

  /**
   * Next.js TS plugin expects function props in client files to be named like actions.
   * Use this in new call-sites.
   */
  onPingAction?: (patch: PingPatch) => void;
} & Record<string, unknown>; // allows legacy props (e.g. onPing) without typing them

export default function LocationTracker(props: Props) {
  const { enabled, disabledReason, onPingAction } = props;

  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [state, setState] = useState<"idle" | "tracking" | "denied" | "error">("idle");
  const [busy, setBusy] = useState(false);

  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  const canRun = enabled && !disabledReason;

  const label = useMemo(() => {
    if (!enabled) return "Location sharing is off.";
    if (disabledReason) return "Location sharing is disabled.";
    if (state === "denied") return "Location permission denied.";
    if (state === "error") return "Location unavailable.";
    return "Location sharing is on.";
  }, [enabled, disabledReason, state]);

  const notifyPing = useCallback(
    (patch: PingPatch) => {
      // Preferred prop name
      if (typeof onPingAction === "function") {
        onPingAction(patch);
        return;
      }

      // Back-compat: allow older call-sites passing `onPing`
      const legacy = (props as any)?.onPing;
      if (typeof legacy === "function") {
        legacy(patch);
      }
    },
    [onPingAction, props],
  );

  const sendPing = useCallback(async () => {
    if (!canRun || busy) return;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("error");
      toast.dismiss();
      toast.error("Geolocation is not available in this browser");
      return;
    }

    setBusy(true);

    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const lat = pos?.coords?.latitude;
            const lng = pos?.coords?.longitude;
            const accuracy = pos?.coords?.accuracy;

            if (typeof lat !== "number" || typeof lng !== "number") {
              setState("error");
              resolve();
              return;
            }

            setState("tracking");

            const { ok, status, json } = await postJson("/api/carrier/me/location", {
              lat,
              lng,
              accuracy: typeof accuracy === "number" ? accuracy : null,
            });

            if (!ok) {
              const msg =
                json?.error ||
                (status === 404
                  ? "Carrier location endpoint is not enabled yet."
                  : status === 401
                    ? "You must be signed in."
                    : "Failed to update location.");
              toast.dismiss();
              toast.error(msg);
              resolve();
              return;
            }

            const now = Date.now();
            setLastSentAt(now);

            notifyPing({
              lastLat: lat,
              lastLng: lng,
              lastSeenAt: new Date(now).toISOString(),
            });

            resolve();
          } catch (e: any) {
            toast.dismiss();
            toast.error(e?.message || "Failed to update location.");
            setState("error");
            resolve();
          }
        },
        (err) => {
          if (err?.code === 1) setState("denied");
          else setState("error");
          resolve();
        },
        { enableHighAccuracy: true, timeout: 9000, maximumAge: 8000 },
      );
    });

    setBusy(false);
  }, [canRun, busy, notifyPing]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!canRun) {
      setState("idle");
      return;
    }

    void sendPing();

    timerRef.current = window.setInterval(() => {
      if (!mountedRef.current) return;
      void sendPing();
    }, 20000);

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [canRun, sendPing]);

  return (
    <div className="space-y-2" aria-label="Location tracker">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-[var(--text)]">{label}</div>

        <button
          type="button"
          onClick={() => void sendPing()}
          disabled={!canRun || busy}
          aria-disabled={!canRun || busy}
          className={[
            "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2",
            "text-sm font-semibold text-[var(--text)] shadow-sm transition",
            "hover:bg-[var(--bg-subtle)] active:scale-[.99]",
            "focus-visible:outline-none focus-visible:ring-2 ring-focus",
          ].join(" ")}
          title={disabledReason || (!enabled ? "Go online to enable location sharing." : undefined)}
        >
          {busy ? "Pinging…" : "Ping now"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
        <span className="chip rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1">
          Last ping: {fmtWhen(lastSentAt)}
        </span>
        {enabled ? (
          <span className="chip rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1">
            Interval: 20s
          </span>
        ) : null}
      </div>

      {disabledReason ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 text-xs text-[var(--text-muted)]">
          {disabledReason}
        </div>
      ) : null}

      {state === "denied" ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 text-xs text-[var(--text-muted)]">
          Location permission is denied. Enable location permissions for this site to go online properly.
        </div>
      ) : null}
    </div>
  );
}
