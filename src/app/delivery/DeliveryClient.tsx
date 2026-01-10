"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

import DeliverySearch, { type DeliverySearchValue } from "./_components/DeliverySearch.client";
import DeliveryMap, { type MapPin } from "./_components/DeliveryMap.client";
import CarrierList, { type CarrierCard } from "./_components/CarrierList.client";
import RequestCarrierSheet, { type DeliveryRequestDraft } from "./_components/RequestCarrierSheet.client";

type InitialParams = {
  near: string | null;
  productId: string | null;
  storeId: string | null;
  q: string | null;
};

type Coords = { lat: number; lng: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseNum(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

function coerceCoords(raw: any): Coords | null {
  const lat =
    parseNum(raw?.lat) ??
    parseNum(raw?.latitude) ??
    parseNum(raw?.storeLat) ??
    parseNum(raw?.store_lat) ??
    parseNum(raw?.sellerLat) ??
    parseNum(raw?.seller_lat) ??
    null;

  const lng =
    parseNum(raw?.lng) ??
    parseNum(raw?.lon) ??
    parseNum(raw?.longitude) ??
    parseNum(raw?.storeLng) ??
    parseNum(raw?.store_lng) ??
    parseNum(raw?.sellerLng) ??
    parseNum(raw?.seller_lng) ??
    null;

  if (lat == null || lng == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

async function fetchJson(url: string, init?: RequestInit) {
  const r = await fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "cache-control": "no-store",
      ...(init?.headers || {}),
    },
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}

function fmtMeters(m?: number | null) {
  if (typeof m !== "number" || !Number.isFinite(m) || m < 0) return "Unknown distance";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function fmtWhen(ts?: string | number | Date | null) {
  if (!ts) return "Unknown";
  const d = ts instanceof Date ? ts : new Date(ts);
  if (!Number.isFinite(d.getTime())) return "Unknown";
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 5) return "Just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export default function DeliveryClient({ initialSearchParams }: { initialSearchParams: InitialParams }) {
  const [nearMode, setNearMode] = useState<"me" | "store">(
    initialSearchParams.near === "store" ? "store" : "me",
  );

  const [productId, setProductId] = useState<string | null>(
    initialSearchParams.productId ? String(initialSearchParams.productId) : null,
  );

  const [storeId, setStoreId] = useState<string | null>(
    initialSearchParams.storeId ? String(initialSearchParams.storeId) : null,
  );

  const [query, setQuery] = useState<string>(initialSearchParams.q ? String(initialSearchParams.q) : "");

  const [origin, setOrigin] = useState<Coords | null>(null);
  const [originLabel, setOriginLabel] = useState<string>("");

  const [storeHint, setStoreHint] = useState<{
    productName?: string | null;
    storeName?: string | null;
    coords?: Coords | null;
  } | null>(null);

  const [loadingStore, setLoadingStore] = useState(false);
  const [carriers, setCarriers] = useState<CarrierCard[]>([]);
  const [loadingCarriers, setLoadingCarriers] = useState(false);
  const [carriersErr, setCarriersErr] = useState<string | null>(null);

  const [requesting, setRequesting] = useState<CarrierCard | null>(null);

  const mountedRef = useRef(false);

  const searchValue: DeliverySearchValue = useMemo(
    () => ({
      q: query,
      near: nearMode,
      productId,
    }),
    [query, nearMode, productId],
  );

  const pins: MapPin[] = useMemo(() => {
    const list: MapPin[] = [];
    if (origin) {
      list.push({
        id: "origin",
        kind: nearMode === "store" ? "store" : "me",
        label: nearMode === "store" ? originLabel || "Store" : originLabel || "You",
        coords: origin,
      });
    }
    for (const c of carriers) {
      if (!c.coords) continue;
      list.push({
        id: c.id,
        kind: "carrier",
        label: c.displayName || "Carrier",
        coords: c.coords,
        meta: {
          tier: c.planTier,
          vehicle: c.vehicleType ?? null,
          ...(typeof (c as any)?.isStale === "boolean" ? { stale: (c as any).isStale } : {}),
        },
      });
    }
    return list;
  }, [origin, nearMode, originLabel, carriers]);

  /**
   * Loads store context for near=store.
   * Returns resolved coords (if any) so callers don't rely on stale state.
   */
  const loadStoreContext = useCallback(
    async (pidOverride?: string | null): Promise<Coords | null> => {
      const pid = typeof pidOverride === "string" ? pidOverride : productId;

      if (nearMode !== "store" || !pid) {
        setStoreHint(null);
        return null;
      }

      setLoadingStore(true);
      try {
        const { ok, status, json } = await fetchJson(`/api/products/${encodeURIComponent(pid)}`, {
          method: "GET",
        });

        if (!ok) {
          setStoreHint({ productName: null, storeName: null, coords: null });
          if (status !== 404) toast.error("Couldn't load product context for delivery");
          return null;
        }

        const prod = (json && (json.product ?? json)) || {};
        const name = typeof prod?.name === "string" ? prod.name : null;

        const seller = prod?.seller && typeof prod.seller === "object" ? prod.seller : null;

        const coords =
          coerceCoords(prod?.store) ??
          coerceCoords(prod?.sellerStore) ??
          coerceCoords(prod?.seller) ??
          coerceCoords(prod) ??
          coerceCoords(seller) ??
          null;

        const storeName =
          (typeof prod?.storeName === "string" && prod.storeName) ||
          (typeof seller?.name === "string" && seller.name) ||
          null;

        setStoreHint({ productName: name, storeName, coords });

        if (coords) {
          setOrigin(coords);
          setOriginLabel(storeName || (name ? `Store for ${name}` : "Store"));
        } else {
          setOrigin(null);
          setOriginLabel(storeName || (name ? `Store for ${name}` : "Store"));
        }

        return coords;
      } catch {
        setStoreHint({ productName: null, storeName: null, coords: null });
        return null;
      } finally {
        setLoadingStore(false);
      }
    },
    [nearMode, productId],
  );

  const useMyLocation = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Geolocation is not available in this browser");
      return;
    }
    toast.dismiss();

    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos?.coords?.latitude;
          const lng = pos?.coords?.longitude;
          if (typeof lat === "number" && typeof lng === "number") {
            const coords = { lat, lng };
            setOrigin(coords);
            setOriginLabel("Your location");
            toast.success("Location updated");
          } else {
            toast.error("Couldn't read your location");
          }
          resolve();
        },
        (err) => {
          const msg =
            err?.code === 1
              ? "Location permission denied"
              : err?.code === 2
                ? "Location unavailable"
                : "Couldn't get your location";
          toast.error(msg);
          resolve();
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      );
    });
  }, []);

  const fetchCarriers = useCallback(
    async (coords: Coords | null, nextQuery?: string) => {
      if (!coords) {
        setCarriers([]);
        setCarriersErr("Pick a location to find nearby carriers.");
        return;
      }

      setLoadingCarriers(true);
      setCarriersErr(null);

      const q = typeof nextQuery === "string" ? nextQuery : query;

      try {
        const params = new URLSearchParams();
        params.set("lat", String(coords.lat));
        params.set("lng", String(coords.lng));

        const qTrim = q.trim();
        if (qTrim) params.set("q", qTrim);

        if (nearMode === "store") {
          params.set("near", "store");
          if (productId) params.set("productId", productId);
          if (storeId) params.set("storeId", storeId);
        }

        const { ok, status, json } = await fetchJson(`/api/carriers/near?${params.toString()}`, {
          method: "GET",
        });

        if (!ok) {
          if (status === 404) {
            setCarriersErr("Carrier search endpoint is not enabled yet.");
          } else if (status === 401) {
            setCarriersErr("You must be signed in to view carriers.");
          } else {
            setCarriersErr(json?.error || "Failed to load carriers.");
          }
          setCarriers([]);
          return;
        }

        const itemsRaw =
          (Array.isArray(json?.items) && json.items) ||
          (Array.isArray(json?.carriers) && json.carriers) ||
          (Array.isArray(json) && json) ||
          [];

        const list: CarrierCard[] = (itemsRaw as any[])
          .map((x: any): CarrierCard | null => {
            if (!x) return null;
            const id = String(x.id ?? x.userId ?? x.carrierId ?? "").trim();
            if (!id) return null;

            const lastSeenAt = x.lastSeenAt ?? x.last_seen_at ?? null;

            const ccoords =
              coerceCoords(x.coords) ??
              (typeof x.lat !== "undefined" || typeof x.lng !== "undefined"
                ? coerceCoords({ lat: x.lat, lng: x.lng })
                : null) ??
              null;

            const distanceMeters =
              parseNum(x.distanceMeters) ??
              parseNum(x.distance_meters) ??
              parseNum(x.distance) ??
              null;

            const planTier =
              typeof x.planTier === "string"
                ? x.planTier
                : typeof x.tier === "string"
                  ? x.tier
                  : "BASIC";

            const statusVal =
              typeof x.status === "string"
                ? x.status
                : typeof x.carrierStatus === "string"
                  ? x.carrierStatus
                  : null;

            const vehicleType =
              typeof x.vehicleType === "string"
                ? x.vehicleType
                : typeof x.vehicle === "string"
                  ? x.vehicle
                  : null;

            const displayName =
              typeof x.displayName === "string"
                ? x.displayName
                : typeof x.name === "string"
                  ? x.name
                  : typeof x.username === "string"
                    ? x.username
                    : "Carrier";

            return {
              id,
              displayName,
              planTier: String(planTier || "BASIC").toUpperCase() as any,
              status: statusVal ? String(statusVal).toUpperCase() : "AVAILABLE",
              vehicleType: vehicleType ? String(vehicleType) : null,
              distanceMeters: typeof distanceMeters === "number" ? distanceMeters : null,
              lastSeenAt: lastSeenAt ? String(lastSeenAt) : null,
              coords: ccoords,
              headline:
                typeof x.headline === "string"
                  ? x.headline
                  : typeof x.bio === "string"
                    ? x.bio
                    : null,
              rating: parseNum(x.rating),
              completedTrips: parseNum(x.completedTrips) ?? parseNum(x.completed_trips),
            } satisfies CarrierCard;
          })
          .filter(Boolean) as CarrierCard[];

        setCarriers(list);

        if (!list.length) {
          setCarriersErr("No available carriers found nearby.");
        }
      } catch (e: any) {
        setCarriers([]);
        setCarriersErr(e?.message || "Failed to load carriers.");
      } finally {
        setLoadingCarriers(false);
      }
    },
    [nearMode, productId, storeId, query],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (nearMode === "store") {
      void loadStoreContext();
      return;
    }

    setStoreHint(null);

    if (!origin) {
      setCarriers([]);
      setCarriersErr("Use your location to find nearby carriers.");
    } else if (mountedRef.current) {
      void fetchCarriers(origin);
    }
  }, [nearMode, loadStoreContext, origin, fetchCarriers]);

  useEffect(() => {
    if (nearMode === "store" && storeHint?.coords) {
      void fetchCarriers(storeHint.coords);
    }
  }, [nearMode, storeHint?.coords, fetchCarriers]);

  const onSearch = useCallback(
    async (next: DeliverySearchValue) => {
      const nextQ = next.q ?? "";
      const nextNear = next.near;
      const nextPid = next.productId ?? null;

      setQuery(nextQ);
      setNearMode(nextNear);
      setProductId(nextPid);

      if (nextNear === "me") {
        if (!origin) {
          setCarriers([]);
          setCarriersErr("Use your location to find nearby carriers.");
          return;
        }
        await fetchCarriers(origin, nextQ);
        return;
      }

      // near=store
      const coords = await loadStoreContext(nextPid);
      if (coords) {
        await fetchCarriers(coords, nextQ);
      } else {
        setCarriers([]);
        setCarriersErr(
          nextPid
            ? "Store location not available yet. Try again once store coordinates are added."
            : "Missing product context. Use a product’s “Find carrier near this store” link.",
        );
      }
    },
    [origin, fetchCarriers, loadStoreContext],
  );

  const onRequestCarrier = useCallback((c: CarrierCard) => setRequesting(c), []);

  const originSummary = useMemo(() => {
    if (!origin) return null;
    const lat = clamp(origin.lat, -90, 90);
    const lng = clamp(origin.lng, -180, 180);
    const label = originLabel || (nearMode === "store" ? "Store" : "Your location");
    return `${label} (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
  }, [origin, originLabel, nearMode]);

  const headerTitle = nearMode === "store" ? "Delivery near a store" : "Delivery near you";

  const subline = useMemo(() => {
    if (nearMode === "store") {
      const name = storeHint?.productName || storeHint?.storeName || null;
      return name ? `Based on: ${name}` : "Find carriers near a seller’s store location.";
    }
    return "Find verified carriers near your location and request delivery.";
  }, [nearMode, storeHint?.productName, storeHint?.storeName]);

  const requestDraft: DeliveryRequestDraft | null = useMemo(() => {
    if (!requesting) return null;
    return {
      carrierId: requesting.id,
      carrierName: requesting.displayName,
      origin: origin ? { ...origin } : null,
      near: nearMode,
      productId: nearMode === "store" ? productId : null,
      note: query.trim() ? query.trim() : null,
    };
  }, [requesting, origin, nearMode, productId, query]);

  const onRequestCreated = useCallback(async () => {
    setRequesting(null);
    if (origin) {
      await fetchCarriers(origin);
    }
  }, [origin, fetchCarriers]);

  const heroBtn = [
    "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold",
    "border-white/20 bg-white/10 text-white shadow-sm transition",
    "hover:bg-white/15 active:scale-[.99]",
    "focus-visible:outline-none focus-visible:ring-2 ring-focus",
    "disabled:opacity-60 disabled:cursor-not-allowed",
  ].join(" ");

  return (
    <div className="space-y-4 sm:space-y-6" aria-label="Delivery">
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
            <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Delivery</p>
            <h1 className="mt-1 text-xl font-extrabold tracking-tight text-white sm:text-2xl">
              {headerTitle}
            </h1>
            <p className="mt-2 text-sm text-white/85">{subline}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={heroBtn}
              onClick={() => {
                setNearMode("me");
                setProductId(null);
                setStoreHint(null);
                setCarriers([]);
                setCarriersErr(origin ? null : "Use your location to find nearby carriers.");
              }}
              aria-pressed={nearMode === "me"}
            >
              Near me
            </button>

            <button
              type="button"
              className={heroBtn}
              onClick={() => {
                setNearMode("store");
                if (initialSearchParams.productId) {
                  setProductId(String(initialSearchParams.productId));
                }
                if (initialSearchParams.storeId) {
                  setStoreId(String(initialSearchParams.storeId));
                }
              }}
              aria-pressed={nearMode === "store"}
            >
              Near store
            </button>

            {nearMode === "me" ? (
              <button type="button" className="btn-gradient-primary" onClick={useMyLocation}>
                Use my location
              </button>
            ) : (
              <button
                type="button"
                className="btn-gradient-primary"
                onClick={() => void loadStoreContext()}
                disabled={loadingStore || !productId}
                aria-disabled={loadingStore || !productId}
                title={!productId ? "Missing productId context" : undefined}
              >
                {loadingStore ? "Loading store…" : "Load store location"}
              </button>
            )}
          </div>
        </div>

        {/* Put the search UI on a light surface so its own token-based text stays readable in light theme */}
        <div
          className="relative mt-4 rounded-2xl border border-white/15 bg-[var(--bg-elevated)] p-3 text-[var(--text)] shadow-soft sm:p-4"
          aria-label="Delivery search"
        >
          <DeliverySearch value={searchValue} onSubmit={onSearch} busy={loadingCarriers || loadingStore} />
        </div>

        <div className="relative mt-3 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs text-white/85">
          {originSummary ? (
            <>
              <span className="font-semibold text-white">Pin:</span> {originSummary}
            </>
          ) : nearMode === "store" ? (
            <>
              <span className="font-semibold text-white">Pin:</span>{" "}
              {productId
                ? "Store location not available yet. You can still search after the store coordinates are added."
                : "Missing product context. Use a product’s “Find carrier near this store” link."}
            </>
          ) : (
            <>
              <span className="font-semibold text-white">Pin:</span> Choose your location to search.
            </>
          )}
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5" aria-label="Delivery results">
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-4">
            <h2 className="text-sm font-semibold text-[var(--text)]">Map</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Preview pins for your location/store and nearby carriers.
            </p>

            <div className="mt-3">
              <DeliveryMap pins={pins} />
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">Carriers</h2>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Ranked by tier, then distance, then last seen.
                </p>
              </div>

              <button
                type="button"
                className={[
                  "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)]",
                  "px-3 py-2 text-sm font-semibold text-[var(--text)] shadow-sm transition",
                  "hover:bg-[var(--bg-subtle)] active:scale-[.99]",
                  "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                ].join(" ")}
                onClick={() => void fetchCarriers(origin)}
                disabled={loadingCarriers || !origin}
                aria-disabled={loadingCarriers || !origin}
              >
                {loadingCarriers ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <div className="mt-3">
              <CarrierList
                carriers={carriers}
                loading={loadingCarriers}
                error={carriersErr}
                onRequest={onRequestCarrier}
                renderMeta={(c) => (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span className="chip rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1">
                      {fmtMeters(c.distanceMeters)}
                    </span>
                    <span className="chip rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1">
                      Last seen: {fmtWhen(c.lastSeenAt)}
                    </span>
                    {(c as any)?.isStale ? (
                      <span className="chip rounded-full border border-[var(--border-subtle)] bg-[var(--bg)] px-2 py-1">
                        Stale
                      </span>
                    ) : (
                      <span className="chip rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1">
                        Live
                      </span>
                    )}
                  </div>
                )}
              />
            </div>
          </div>
        </div>
      </section>

      <RequestCarrierSheet
        open={Boolean(requestDraft)}
        draft={requestDraft}
        onClose={() => setRequesting(null)}
        onCreated={onRequestCreated}
      />
    </div>
  );
}
