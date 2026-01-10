"use client";

import { useMemo } from "react";

export type MapPin = {
  id: string;
  kind: "me" | "store" | "carrier";
  label: string;
  coords: { lat: number; lng: number };
  meta?: {
    tier?: "BASIC" | "GOLD" | "PLATINUM" | string;
    vehicle?: string | null;
    stale?: boolean;
  };
};

function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function approxMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  // Haversine (small distance safe enough)
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}

function vehicleIcon(v?: string | null) {
  const t = (v || "").trim().toLowerCase();
  if (!t) return "📦";
  if (t.includes("bike") || t.includes("bicycle")) return "🚲";
  if (t.includes("moto") || t.includes("motor")) return "🏍️";
  if (t.includes("car")) return "🚗";
  if (t.includes("van") || t.includes("truck")) return "🚚";
  return "📦";
}

export default function DeliveryMap({ pins }: { pins: MapPin[] }) {
  const origin = useMemo(() => pins.find((p) => p.kind === "me" || p.kind === "store") ?? null, [pins]);

  const plotted = useMemo(() => {
    if (!origin) return [];

    const center = origin.coords;
    const carriers = pins.filter((p) => p.kind === "carrier" && p.coords);

    const maxDist = Math.max(
      250,
      ...carriers.map((p) => approxMeters(center, p.coords)).filter((m) => isFiniteNum(m)),
    );

    return pins.map((p) => {
      const dist = approxMeters(center, p.coords);
      const norm = maxDist > 0 ? Math.min(1, dist / maxDist) : 0;

      // compute a crude direction (not a real projection, just a stable-ish layout)
      const dx = p.coords.lng - center.lng;
      const dy = p.coords.lat - center.lat;

      const angle = Math.atan2(dy, dx);
      const r = 0.42 * norm; // keep away from edges

      const x = 0.5 + r * Math.cos(angle);
      const y = 0.5 - r * Math.sin(angle);

      return {
        ...p,
        dist,
        x,
        y,
      };
    });
  }, [pins, origin]);

  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)]",
        "shadow-sm",
      ].join(" ")}
      style={{ aspectRatio: "16 / 10" }}
      aria-label="Delivery map preview"
      role="img"
    >
      {!origin ? (
        <div className="grid h-full place-content-center p-4 text-center">
          <div className="text-sm font-semibold text-[var(--text)]">No pin yet</div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            Set a location to preview carriers on the map.
          </div>
        </div>
      ) : (
        <>
          <div className="absolute inset-0 bg-noise opacity-70" aria-hidden="true" />

          {plotted.map((p) => {
            const isOrigin = p.kind === "me" || p.kind === "store";
            const label = p.label || (isOrigin ? "Pin" : "Carrier");

            const icon =
              p.kind === "carrier"
                ? vehicleIcon(p.meta?.vehicle ?? null)
                : p.kind === "store"
                  ? "🏪"
                  : "📍";

            const ring =
              isOrigin
                ? "ring-2 ring-[var(--border)]"
                : p.meta?.tier?.toUpperCase?.() === "PLATINUM"
                  ? "ring-2 ring-[var(--border)]"
                  : "ring-1 ring-[var(--border-subtle)]";

            const badge =
              isOrigin
                ? "bg-[var(--bg-elevated)]"
                : p.meta?.stale
                  ? "bg-[var(--bg)]"
                  : "bg-[var(--bg-elevated)]";

            return (
              <div
                key={p.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${(p as any).x * 100}%`, top: `${(p as any).y * 100}%` }}
                aria-label={label}
                title={label}
              >
                <div
                  className={[
                    "grid h-9 w-9 place-content-center rounded-2xl border border-[var(--border-subtle)]",
                    badge,
                    "text-[var(--text)] shadow-soft",
                    ring,
                  ].join(" ")}
                >
                  <span aria-hidden="true">{icon}</span>
                </div>

                <div className="mt-1 max-w-[140px] truncate text-center text-[11px] font-semibold text-[var(--text)]">
                  {label}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
