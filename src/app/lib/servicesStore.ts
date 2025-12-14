"use client";
// src/app/lib/servicesStore.ts

import { useCallback, useEffect, useRef, useState } from "react";
import { extractGalleryUrls } from "@/app/lib/media";

/* Types */
export type Service = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  subcategory?: string | null;
  price?: number | null; // null => contact for quote
  rateType?: "hour" | "day" | "fixed";
  serviceArea?: string | null;
  availability?: string | null;
  image?: string | null;
  gallery?: string[] | null;
  location?: string | null;
  status?: "ACTIVE" | "SOLD" | "HIDDEN" | "DRAFT";
  featured?: boolean;
  createdAt?: string; // ISO

  // Keep both for compatibility; API uses sellerId
  providerId?: string | null;
  sellerId?: string | null;

  // Optional seller snapshot (as returned by API)
  sellerName?: string | null;
  sellerLocation?: string | null;
  sellerMemberSince?: string | null;
  sellerRating?: number | null;
  sellerSales?: number | null;
  seller?: {
    id?: string;
    name?: string | null;
    image?: string | null;
    username?: string | null;
    subscription?: string | null;
  } | null;

  /** ---- Optional hardening fields ---- */
  /** True when the payload looks shallow (e.g., cover-only / <2 media). */
  _partial?: boolean;
  /** Number of unique, valid media URLs detected on the object. */
  mediaCount?: number;
};

type ApiListEnvelope = { items: Service[] };
type ApiListResponse = Service[] | ApiListEnvelope | { error: string };

export type UseServicesReturn = {
  services: Service[];
  ready: boolean;
  error?: string | null;
  reload: () => void;
  /** Optional creator to mirror product UX. Returns new id. */
  addService: (payload: any) => Promise<{ id: string }>;
  /** Light re-fetch if cache is stale. */
  refreshIfStale: () => Promise<void>;
  /** Synchronous cache read. */
  getById: (id: string) => Service | undefined;
  /** PATCH an existing service and update caches. */
  updateService: (id: string, patch: Record<string, unknown>) => Promise<Service>;
};

export type UseServicesOptions = {
  initial?: Service[];
  cacheTtlMs?: number; // default 60s
  /** Page size (24..48). Default 48 to match server caps. */
  pageSize?: number;
};

/* ------------------------------ Constants ------------------------------ */

const LIST_KEY = "qs_services_list_v1";
const DEFAULT_PAGE_SIZE = 48; // ✅ align with API caps
const MIN_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 48; // ✅ align with API caps
const FETCH_TIMEOUT_MS = 12_000;

/* ------------------------------ Memory cache ------------------------------ */

const memory = {
  list: [] as Service[],
  map: new Map<string, Service>(),
  lastAt: 0,
};

/* --------------------------- Media meta helpers --------------------------- */

type SourceTag = "list" | "detail" | "optimistic";

/** Count valid media URLs without injecting placeholders. */
function computeMediaCount(obj: unknown): number {
  try {
    const urls = extractGalleryUrls(obj, undefined /* no fallback */);
    return Array.isArray(urls) ? urls.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Attach media meta:
 * - mediaCount: number of valid URLs (cover + arrays)
 * - _partial:   true if object looks shallow (mediaCount < 2)
 */
function withMediaMeta<T extends Service>(s: T, src: SourceTag): T {
  const mediaCount = computeMediaCount(s);
  const isPartial = mediaCount < 2 && (src === "list" || src === "optimistic" || src === "detail");

  // Upgrade from partial->complete, otherwise keep stable
  if (s._partial && !isPartial) {
    return { ...s, mediaCount, _partial: false };
  }
  if (s.mediaCount !== mediaCount || s._partial !== isPartial) {
    return { ...s, mediaCount, _partial: isPartial };
  }
  return s;
}

/* ------------------------------ Cache utils ------------------------------ */

function normId(v: unknown): string {
  return String(v ?? "").trim();
}

function cacheListToMemory(list: Service[]) {
  memory.list = list;
  memory.map = new Map(list.map((s) => [normId(s.id), s]));
  memory.lastAt = Date.now();
}
function updateOneInMemory(next: Service) {
  const id = normId(next.id);
  const merged = { ...(memory.map.get(id) ?? {}), ...next, id } as Service;
  memory.map.set(id, merged);
  const idx = memory.list.findIndex((s) => normId(s.id) === id);
  if (idx >= 0) memory.list[idx] = merged;
  else memory.list = [merged, ...memory.list];
  memory.lastAt = Date.now();
}
function safeSessionGet<T>(key: string): T | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function safeSessionSet<T>(key: string, val: T) {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore quota errors */
  }
}
function normalizeList(resp: ApiListResponse): Service[] {
  if (Array.isArray(resp)) return resp;
  if (resp && typeof resp === "object" && "items" in resp && Array.isArray((resp as any).items)) {
    return (resp as ApiListEnvelope).items;
  }
  return [];
}

/* ------------------------------- Fetch layer ------------------------------ */

type FetchListArgs = {
  pageSize: number;
  signal?: AbortSignal | null;
};

async function fetchJson(input: RequestInfo, init?: RequestInit & { timeoutMs?: number }) {
  const timeoutMs = init?.timeoutMs ?? FETCH_TIMEOUT_MS;

  // Merge the caller's signal with our timeout controller
  const ctrl = new AbortController();
  const extSignal = init?.signal ?? null;

  if (extSignal) {
    if (extSignal.aborted) {
      ctrl.abort();
    } else {
      extSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
    }
  }

  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(input, {
      credentials: "include",
      cache: "no-store",
      ...init,
      signal: ctrl.signal,
      headers: { Accept: "application/json", ...(init?.headers || {}) },
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON response */
    }
    return { res, json };
  } finally {
    clearTimeout(t);
  }
}

async function fetchList(args: FetchListArgs): Promise<Service[]> {
  const { pageSize, signal } = args;
  const qs = new URLSearchParams({ page: "1", pageSize: String(pageSize) });
  const init: RequestInit | undefined = signal ? { signal } : undefined;
  const { res, json } = await fetchJson(`/api/services?${qs.toString()}`, init);
  if (!res.ok) throw new Error((json as any)?.error || `Failed (${res.status})`);
  // annotate as list (cover-only payloads become _partial)
  return normalizeList(json as ApiListResponse).map((s) => withMediaMeta(s, "list"));
}

async function fetchItem(id: string, signal?: AbortSignal | null): Promise<Service> {
  const sid = encodeURIComponent(normId(id));
  const init: RequestInit | undefined = signal ? { signal } : undefined;
  const { res, json } = await fetchJson(`/api/services/${sid}`, init);
  if (!res.ok || (json as any)?.error) {
    throw new Error((json as any)?.error || `Not found (${res.status})`);
  }
  // annotate as detail (usually upgrades _partial -> false)
  return withMediaMeta(json as Service, "detail");
}

/* Simple retry with backoff for list fetch in silent refreshes */
async function tryFetchListWithBackoff(args: FetchListArgs) {
  const { signal } = args;
  const waits = [0, 600, 1200];
  let lastErr: unknown;
  for (let i = 0; i < waits.length; i++) {
    try {
      return await fetchList(args);
    } catch (e) {
      lastErr = e;
      if (signal?.aborted) throw e;
      if (i < waits.length - 1) await new Promise((r) => setTimeout(r, waits[i + 1]));
    }
  }
  throw lastErr;
}

/* ---------------------------------- Hook --------------------------------- */

export function useServices(options: UseServicesOptions = {}): UseServicesReturn {
  const cacheTtl = Math.max(5_000, options.cacheTtlMs ?? 60_000);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, options.pageSize ?? DEFAULT_PAGE_SIZE));

  // seed once
  if (options.initial && memory.list.length === 0) {
    const seeded = options.initial.map((s) => withMediaMeta(s, "list"));
    cacheListToMemory(seeded);
    safeSessionSet(LIST_KEY, seeded);
  }

  const [services, setServices] = useState<Service[]>(memory.list);
  const [ready, setReady] = useState<boolean>(memory.list.length > 0);
  const [error, setError] = useState<string | null>(null);
  const acRef = useRef<AbortController | null>(null);

  const applyList = useCallback((list: Service[]) => {
    const annotated = list.map((s) => withMediaMeta(s, "list"));
    cacheListToMemory(annotated);
    safeSessionSet(LIST_KEY, annotated);
    setServices(annotated);
  }, []);

  const revalidateSilently = useCallback(async () => {
    try {
      const list = await tryFetchListWithBackoff({ pageSize });
      applyList(list);
    } catch {
      /* best-effort */
    }
  }, [applyList, pageSize]);

  const load = useCallback(
    async (force = false) => {
      setError(null);

      const fresh = Date.now() - memory.lastAt < cacheTtl;
      if (!force && memory.list.length && fresh) {
        setServices(memory.list);
        setReady(true);
        void revalidateSilently();
        return;
      }

      if (!memory.list.length && !force) {
        const saved = safeSessionGet<Service[]>(LIST_KEY);
        if (saved?.length) {
          // ensure annotated even if legacy session lacked meta
          const annotated = saved.map((s) => withMediaMeta(s, "list"));
          cacheListToMemory(annotated);
          setServices(annotated);
          setReady(true);
          void revalidateSilently();
          return;
        }
      }

      // Network fetch (with abort)
      acRef.current?.abort();
      acRef.current = new AbortController();

      try {
        const list = await fetchList({ pageSize, signal: acRef.current.signal });
        applyList(list);
        setReady(true);
      } catch (e: any) {
        setError(e?.message || "Failed to load services");
        setServices([]);
        setReady(true);
      }
    },
    [applyList, cacheTtl, pageSize, revalidateSilently]
  );

  // Initial load + visibility/online SWR
  useEffect(() => {
    void load(false);

    let visTimer: number | null = null;
    const onVisibility = () => {
      if (!document.hidden) {
        if (visTimer) window.clearTimeout(visTimer);
        visTimer = window.setTimeout(() => void revalidateSilently(), 250);
      }
    };
    const onOnline = () => void revalidateSilently();

    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      acRef.current?.abort();
      if (visTimer) window.clearTimeout(visTimer);
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(() => void load(true), [load]);

  const refreshIfStale = useCallback(async () => {
    const fresh = Date.now() - memory.lastAt < cacheTtl;
    if (!fresh) await revalidateSilently();
  }, [cacheTtl, revalidateSilently]);

  const addService = useCallback(
    async (payload: any) => {
      const r = await fetch("/api/services/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      const newId = normId(j?.serviceId || j?.id || j?.service?.id || j?.data?.id);
      if (!r.ok || !newId) throw new Error(j?.error || `Failed to create service (${r.status})`);

      // Minimal optimistic item (annotated as optimistic)
      const placeholder: Service = withMediaMeta(
        {
          id: newId,
          name: String(payload?.name ?? ""),
          description: payload?.description ?? null,
          category: String(payload?.category ?? ""),
          subcategory: payload?.subcategory ?? null,
          price: typeof payload?.price === "number" ? payload.price : null,
          // never set null to union fields
          rateType:
            payload?.rateType === "hour" || payload?.rateType === "day" || payload?.rateType === "fixed"
              ? payload.rateType
              : "fixed",
          serviceArea: payload?.serviceArea ?? null,
          availability: payload?.availability ?? null,
          image: payload?.image ?? null,
          gallery: Array.isArray(payload?.gallery) ? payload.gallery.map(String) : [],
          location: payload?.location ?? null,
          createdAt: new Date().toISOString(),
          providerId: null,
        },
        "optimistic"
      );

      updateOneInMemory(placeholder);
      cacheListToMemory([...memory.list]);
      safeSessionSet(LIST_KEY, memory.list);
      setServices([...memory.list]);

      // Hydrate with server truth in the background (annotated as detail)
      fetchItem(newId)
        .then((fresh) => {
          updateOneInMemory(fresh);
          cacheListToMemory([...memory.list]);
          safeSessionSet(LIST_KEY, memory.list);
          setServices([...memory.list]);
        })
        .catch(() => {
          /* ignore; user still sees placeholder */
        });

      void refreshIfStale();

      return { id: newId };
    },
    [refreshIfStale]
  );

  const getById = useCallback((id: string) => memory.map.get(normId(id)), []);

  const updateService = useCallback(
    async (id: string, patch: Record<string, unknown>): Promise<Service> => {
      const sid = normId(id);
      const prev = memory.map.get(sid) || null;

      // sanitize union fields from patch (avoid null -> union errors)
      const safePatch: Record<string, unknown> = { ...patch };
      if ("rateType" in safePatch && safePatch["rateType"] != null) {
        const v = safePatch["rateType"];
        if (v !== "hour" && v !== "day" && v !== "fixed") delete safePatch["rateType"];
      }
      if ("status" in safePatch && safePatch["status"] != null) {
        const v = safePatch["status"];
        if (v !== "ACTIVE" && v !== "SOLD" && v !== "HIDDEN" && v !== "DRAFT") delete safePatch["status"];
      }

      const optimistic: Service | null = prev ? withMediaMeta({ ...prev, ...safePatch, id: prev.id } as Service, "optimistic") : null;

      if (optimistic) {
        updateOneInMemory(optimistic);
        cacheListToMemory([...memory.list]);
        safeSessionSet(LIST_KEY, memory.list);
        setServices([...memory.list]);
      }

      const r = await fetch(`/api/services/${encodeURIComponent(sid)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "include",
        body: JSON.stringify(safePatch),
      });
      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || j?.error) {
        if (prev) {
          updateOneInMemory(prev);
          cacheListToMemory([...memory.list]);
          safeSessionSet(LIST_KEY, memory.list);
          setServices([...memory.list]);
        }
        throw new Error(j?.error || `Failed to update service (${r.status})`);
      }

      const freshRaw = (j && typeof j === "object" ? j : null) as Service | null;
      const fresh = freshRaw ? withMediaMeta(freshRaw, "detail") : null;

      if (fresh && fresh.id) {
        updateOneInMemory(fresh);
        cacheListToMemory([...memory.list]);
        safeSessionSet(LIST_KEY, memory.list);
        setServices([...memory.list]);
      } else if (optimistic) {
        updateOneInMemory(optimistic);
      }

      void refreshIfStale();

      return memory.map.get(sid)!;
    },
    [refreshIfStale]
  );

  return {
    services,
    ready,
    error,
    reload: () => void load(true),
    addService,
    refreshIfStale,
    getById,
    updateService,
  };
}

/* Convenience accessors */
export function getCachedService(id: string): Service | undefined {
  return memory.map.get(normId(id));
}
export function primeServicesCache(list: Service[]) {
  const annotated = list.map((s) => withMediaMeta(s, "list"));
  cacheListToMemory(annotated);
  safeSessionSet(LIST_KEY, annotated);
}

/* ---- Compatibility alias (keep named + allow default imports) ---- */
export default useServices;
