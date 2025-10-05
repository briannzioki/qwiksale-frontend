// src/app/lib/servicesStore.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  createdAt?: string; // ISO
  providerId?: string | null;
};

type ApiListEnvelope = { items: Service[] };
type ApiListResponse = Service[] | ApiListEnvelope | { error: string };

export type UseServicesReturn = {
  services: Service[];
  ready: boolean;
  error?: string | null;
  reload: () => void;
  /** Optional creator to mirror product UX (not required by your forms). */
  addService: (payload: any) => Promise<{ id: string }>;
  refreshIfStale: () => Promise<void>;
  getById: (id: string) => Service | undefined;
  /** PATCH an existing service and update caches. */
  updateService: (id: string, patch: Record<string, unknown>) => Promise<Service>;
};

export type UseServicesOptions = {
  initial?: Service[];
  cacheTtlMs?: number; // default 60s
};

const LIST_KEY = "qs_services_list_v1";

const memory = {
  list: [] as Service[],
  map: new Map<string, Service>(),
  lastAt: 0,
};

function cacheListToMemory(list: Service[]) {
  memory.list = list;
  memory.map = new Map(list.map((s) => [String(s.id), s]));
  memory.lastAt = Date.now();
}
function updateOneInMemory(next: Service) {
  const id = String(next.id);
  memory.map.set(id, next);
  const idx = memory.list.findIndex((s) => String(s.id) === id);
  if (idx >= 0) memory.list[idx] = next;
  else memory.list = [next, ...memory.list];
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
  } catch {}
}
function normalizeList(resp: ApiListResponse): Service[] {
  if (Array.isArray(resp)) return resp;
  if (resp && typeof resp === "object" && "items" in resp && Array.isArray((resp as any).items)) {
    return (resp as ApiListEnvelope).items;
  }
  return [];
}

async function fetchJson(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, {
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { res, json };
}

async function fetchList(): Promise<Service[]> {
  const { res, json } = await fetchJson(`/api/services?page=1&pageSize=60`);
  if (!res.ok) throw new Error((json as any)?.error || `Failed (${res.status})`);
  return normalizeList(json as ApiListResponse);
}
async function fetchItem(id: string): Promise<Service> {
  const { res, json } = await fetchJson(`/api/services/${encodeURIComponent(id)}`);
  if (!res.ok || (json as any)?.error) {
    throw new Error((json as any)?.error || `Not found (${res.status})`);
  }
  return json as Service;
}

/* Hook */
export function useServices(options: UseServicesOptions = {}): UseServicesReturn {
  const cacheTtl = Math.max(5_000, options.cacheTtlMs ?? 60_000);

  // seed once
  if (options.initial && memory.list.length === 0) {
    cacheListToMemory(options.initial);
    safeSessionSet(LIST_KEY, options.initial);
  }

  const [services, setServices] = useState<Service[]>(memory.list);
  const [ready, setReady] = useState<boolean>(memory.list.length > 0);
  const [error, setError] = useState<string | null>(null);

  const applyList = useCallback((list: Service[]) => {
    cacheListToMemory(list);
    safeSessionSet(LIST_KEY, list);
    setServices(list);
  }, []);

  const revalidate = useCallback(async () => {
    try {
      const list = await fetchList();
      applyList(list);
    } catch {}
  }, [applyList]);

  const load = useCallback(
    async (force = false) => {
      setError(null);

      const fresh = Date.now() - memory.lastAt < cacheTtl;
      if (!force && memory.list.length && fresh) {
        setServices(memory.list);
        setReady(true);
        void revalidate();
        return;
      }

      if (!memory.list.length && !force) {
        const saved = safeSessionGet<Service[]>(LIST_KEY);
        if (saved?.length) {
          cacheListToMemory(saved);
          setServices(saved);
          setReady(true);
          void revalidate();
          return;
        }
      }

      try {
        const list = await fetchList();
        applyList(list);
        setReady(true);
      } catch (e: any) {
        setError(e?.message || "Failed to load services");
        setServices([]);
        setReady(true);
      }
    },
    [applyList, cacheTtl, revalidate]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const reload = useCallback(() => void load(true), [load]);

  const refreshIfStale = useCallback(async () => {
    const fresh = Date.now() - memory.lastAt < cacheTtl;
    if (!fresh) await revalidate();
  }, [cacheTtl, revalidate]);

  const addService = useCallback(async (payload: any) => {
    const r = await fetch("/api/services/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    const newId = String(j?.serviceId || j?.id || j?.service?.id || j?.data?.id || "").trim();
    if (!r.ok || !newId) throw new Error(j?.error || `Failed to create service (${r.status})`);

    const now = new Date().toISOString();
    const item: Service = {
      id: newId,
      name: String(payload?.name ?? ""),
      description: payload?.description ?? null,
      category: String(payload?.category ?? ""),
      subcategory: payload?.subcategory ?? null,
      price: typeof payload?.price === "number" ? payload.price : null,
      rateType: payload?.rateType ?? "fixed",
      serviceArea: payload?.serviceArea ?? null,
      availability: payload?.availability ?? null,
      image: payload?.image ?? null,
      gallery: Array.isArray(payload?.gallery) ? payload.gallery.map(String) : [],
      location: payload?.location ?? null,
      status: "ACTIVE",
      createdAt: now,
      providerId: null,
    };

    updateOneInMemory(item);
    cacheListToMemory([...memory.list]);
    safeSessionSet(LIST_KEY, memory.list);
    setServices([...memory.list]);

    void refreshIfStale();

    return { id: newId };
  }, [refreshIfStale]);

  const getById = useCallback((id: string) => memory.map.get(String(id)), []);

  const updateService = useCallback(
    async (id: string, patch: Record<string, unknown>): Promise<Service> => {
      const sid = String(id);
      const prev = memory.map.get(sid) || null;
      const optimistic: Service | null = prev ? ({ ...prev, ...patch, id: prev.id } as Service) : null;

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
        body: JSON.stringify(patch),
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

      const fresh = (j && typeof j === "object" ? j : null) as Service | null;
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

  return { services: services, ready, error, reload, addService, refreshIfStale, getById, updateService };
}

/* Convenience accessors */
export function getCachedService(id: string): Service | undefined {
  return memory.map.get(String(id));
}
export function primeServicesCache(list: Service[]) {
  cacheListToMemory(list);
  safeSessionSet(LIST_KEY, list);
}

/* ---- Compatibility alias (keep named + allow default imports) ---- */
export default useServices;
