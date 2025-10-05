// src/app/lib/productsStore.ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type Product = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  subcategory: string;
  brand?: string | null;
  condition?: string | null;
  price?: number | null;
  image?: string | null;
  gallery?: string[] | null;
  location?: string | null;
  negotiable: boolean;
  createdAt: string; // ISO
  featured: boolean;
  sellerId?: string | null;
  seller?: {
    id: string;
    name?: string | null;
    image?: string | null;
    subscription: "FREE" | "GOLD" | "PLATINUM";
  } | null;
};

type ApiListEnvelope = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: Product[];
};

type ApiListResponse = Product[] | ApiListEnvelope | { error: string };

export type UseProductsReturn = {
  products: Product[];
  ready: boolean;
  error?: string | null;
  reload: () => void;
  /** Create a product, update local caches, and return { id } */
  addProduct: (payload: any) => Promise<{ id: string }>;
  /** Revalidate only if cache is stale (no UI jank). */
  refreshIfStale: () => Promise<void>;
  /** Cheap selector against in-memory cache. */
  getById: (id: string) => Product | undefined;
  /** PATCH an existing product and update caches. Returns the merged Product. */
  updateProduct: (id: string, patch: Record<string, unknown>) => Promise<Product>;
};

/* Optional config for useProducts (non-breaking) */
export type UseProductsOptions = {
  /** Override the default pageSize (capped between 24..120). */
  pageSize?: number;
  /** Provide initial products to prime cache (e.g., RSC prefetch). */
  initial?: Product[];
  /** How long a cached list is considered fresh (ms). Default 60s. */
  cacheTtlMs?: number;
};

/* ------------------------------------------------------------------ */
/* In-memory + session cache                                          */
/* ------------------------------------------------------------------ */

const LIST_KEY = "qs_products_list_v1"; // sessionStorage key
const DEFAULT_PAGE_SIZE = 60;
const MIN_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 120;

const memory = {
  list: [] as Product[],
  map: new Map<string, Product>(),
  lastAt: 0, // epoch ms when memory cache was set
};

function cacheListToMemory(list: Product[]) {
  memory.list = list;
  memory.map = new Map(list.map((p) => [String(p.id), p]));
  memory.lastAt = Date.now();
}

function updateOneInMemory(next: Product) {
  const id = String(next.id);
  memory.map.set(id, next);
  // splice into list (keep order stable if already present)
  const idx = memory.list.findIndex((p) => String(p.id) === id);
  if (idx >= 0) {
    memory.list[idx] = next;
  } else {
    memory.list = [next, ...memory.list];
  }
  memory.lastAt = Date.now();
}

function safeSessionGet<T>(key: string): T | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
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

function normalizeList(resp: ApiListResponse): Product[] {
  if (Array.isArray(resp)) return resp;
  if (resp && typeof resp === "object" && "items" in resp && Array.isArray((resp as any).items)) {
    return (resp as ApiListEnvelope).items;
  }
  return [];
}

function dedupeById(list: Product[]): Product[] {
  const seen = new Set<string>();
  const out: Product[] = [];
  for (const p of list) {
    const id = String(p.id);
    if (!seen.has(id)) {
      seen.add(id);
      out.push(p);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Fetch helpers (with backoff + abort)                               */
/* ------------------------------------------------------------------ */

type FetchListArgs = {
  pageSize: number;
  signal?: AbortSignal | null;
};

const FETCH_TIMEOUT_MS = 12_000;

/**
 * Fetch JSON with:
 *  - credentials: include (for auth cookies)
 *  - caller-provided AbortSignal support
 *  - internal timeout that ALSO cancels the request
 */
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

async function fetchList(args: FetchListArgs): Promise<Product[]> {
  const { pageSize, signal } = args;
  const qs = new URLSearchParams({ page: "1", pageSize: String(pageSize) });

  const init: RequestInit | undefined = signal ? { signal } : undefined;

  const { res, json } = await fetchJson(`/api/products?${qs.toString()}`, init);
  if (!res.ok) {
    const msg = (json as any)?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return dedupeById(normalizeList(json as ApiListResponse));
}

async function fetchItem(id: string, signal?: AbortSignal | null): Promise<Product> {
  const init: RequestInit | undefined = signal ? { signal } : undefined;

  const { res, json } = await fetchJson(`/api/products/${encodeURIComponent(id)}`, init);
  if (!res.ok || (json as any)?.error) {
    throw new Error((json as any)?.error || `Not found (${res.status})`);
  }
  return json as Product;
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

/* ------------------------------------------------------------------ */
/* Public hooks                                                        */
/* ------------------------------------------------------------------ */

export function useProducts(options: UseProductsOptions = {}): UseProductsReturn {
  const cacheTtl = Math.max(5_000, options.cacheTtlMs ?? 60_000);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, options.pageSize ?? DEFAULT_PAGE_SIZE));

  // Prime memory cache once if initial is provided and memory is empty
  if (options.initial && memory.list.length === 0) {
    const seeded = dedupeById(options.initial);
    cacheListToMemory(seeded);
    safeSessionSet(LIST_KEY, seeded);
  }

  const [products, setProducts] = useState<Product[]>(memory.list);
  const [ready, setReady] = useState<boolean>(memory.list.length > 0);
  const [error, setError] = useState<string | null>(null);
  const acRef = useRef<AbortController | null>(null);

  const applyList = useCallback((list: Product[]) => {
    const deduped = dedupeById(list);
    cacheListToMemory(deduped);
    safeSessionSet(LIST_KEY, deduped);
    setProducts(deduped);
  }, []);

  const revalidateSilently = useCallback(async () => {
    try {
      const list = await tryFetchListWithBackoff({ pageSize });
      applyList(list);
    } catch {
      /* silent */
    }
  }, [applyList, pageSize]);

  const load = useCallback(
    async (force = false) => {
      setError(null);

      // Fresh memory cache
      const fresh = Date.now() - memory.lastAt < cacheTtl;
      if (!force && memory.list.length && fresh) {
        setProducts(memory.list);
        setReady(true);
        void revalidateSilently();
        return;
      }

      // Session cache for instant paint
      if (!memory.list.length && !force) {
        const sessionList = safeSessionGet<Product[]>(LIST_KEY);
        if (sessionList?.length) {
          cacheListToMemory(sessionList);
          setProducts(sessionList);
          setReady(true);
          void revalidateSilently();
          return;
        }
      }

      // Network fetch
      acRef.current?.abort();
      acRef.current = new AbortController();

      try {
        const list = await fetchList({ pageSize, signal: acRef.current.signal });
        applyList(list);
        setReady(true);
      } catch (e: any) {
        setError(e?.message || "Failed to load products");
        setProducts([]);
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

  const reload = useCallback(() => {
    void load(true);
  }, [load]);

  const refreshIfStale = useCallback(async () => {
    const fresh = Date.now() - memory.lastAt < cacheTtl;
    if (!fresh) await revalidateSilently();
  }, [cacheTtl, revalidateSilently]);

  /** Create product, update caches, return { id } */
  const addProduct = useCallback(
    async (payload: any): Promise<{ id: string }> => {
      const r = await fetch("/api/products/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      const newId = String(j?.productId || j?.id || j?.product?.id || j?.data?.id || "").trim();

      if (!r.ok || !newId) {
        throw new Error(j?.error || `Failed to create product (${r.status})`);
      }

      // Build a local product for optimistic cache
      const nowIso = new Date().toISOString();
      const newItem: Product = {
        id: newId,
        name: String(payload.name ?? ""),
        description: payload.description ?? null,
        category: String(payload.category ?? ""),
        subcategory: String(payload.subcategory ?? ""),
        brand: payload.brand ?? null,
        condition: payload.condition ?? null,
        price:
          typeof payload.price === "number"
            ? payload.price
            : payload.price === "" || payload.price == null
            ? null
            : Number(payload.price) || null,
        image: payload.image ?? null,
        gallery: Array.isArray(payload.gallery) ? payload.gallery.map(String) : [],
        location: payload.location ?? null,
        negotiable: !!payload.negotiable,
        createdAt: nowIso,
        featured: false,
        sellerId: null,
      };

      // Update caches and state optimistically
      updateOneInMemory(newItem);
      const deduped = dedupeById([...memory.list]);
      cacheListToMemory(deduped);
      safeSessionSet(LIST_KEY, deduped);
      setProducts(deduped);
      setReady(true);

      // Pick up server-enriched fields
      void revalidateSilently();

      return { id: newId };
    },
    [revalidateSilently]
  );

  const getById = useCallback((id: string) => memory.map.get(String(id)), []);

  /** PATCH product and update caches */
  const updateProduct = useCallback(
    async (id: string, patch: Record<string, unknown>): Promise<Product> => {
      const pid = String(id);
      // Optimistic candidate
      const prev = memory.map.get(pid) || null;
      const optimistic: Product | null = prev
        ? ({ ...prev, ...patch, id: prev.id } as Product)
        : null;

      if (optimistic) {
        updateOneInMemory(optimistic);
        const deduped = dedupeById([...memory.list]);
        cacheListToMemory(deduped);
        safeSessionSet(LIST_KEY, deduped);
        setProducts(deduped);
      }

      const r = await fetch(`/api/products/${encodeURIComponent(pid)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "include",
        body: JSON.stringify(patch),
      });
      const j = await r.json().catch(() => ({} as any));
      if (!r.ok || j?.error) {
        // rollback if needed
        if (prev) {
          updateOneInMemory(prev);
          const deduped = dedupeById([...memory.list]);
          cacheListToMemory(deduped);
          safeSessionSet(LIST_KEY, deduped);
          setProducts(deduped);
        }
        throw new Error(j?.error || `Failed to update product (${r.status})`);
      }

      const fresh = (j && typeof j === "object" ? j : null) as Product | null;
      if (fresh && fresh.id) {
        updateOneInMemory(fresh);
        const deduped = dedupeById([...memory.list]);
        cacheListToMemory(deduped);
        safeSessionSet(LIST_KEY, deduped);
        setProducts(deduped);
      } else if (optimistic) {
        // If API returns no body, keep optimistic
        updateOneInMemory(optimistic);
      }

      // background refresh
      void refreshIfStale();

      return memory.map.get(pid)!;
    },
    [refreshIfStale]
  );

  return { products, ready, error, reload, addProduct, refreshIfStale, getById, updateProduct };
}

/**
 * useProduct(id)
 * - Returns a single product from cache immediately if present.
 * - Always attempts to fetch the authoritative product and updates caches.
 * - Useful for product detail pages to avoid "not found on page 1" issues.
 */
export function useProduct(id: string) {
  const seed = id ? memory.map.get(String(id)) ?? null : null;
  const [product, setProduct] = useState<Product | null>(seed);
  const [loading, setLoading] = useState<boolean>(!seed);
  const [error, setError] = useState<string | null>(null);
  const acRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (force = false) => {
      if (!id) return;
      setError(null);

      if (!force && memory.map.has(String(id))) {
        setProduct(memory.map.get(String(id)) || null);
        setLoading(false);
      } else {
        setLoading(true);
      }

      acRef.current?.abort();
      acRef.current = new AbortController();

      try {
        const p = await fetchItem(id, acRef.current.signal);
        updateOneInMemory(p);
        const deduped = dedupeById([...memory.list]);
        cacheListToMemory(deduped);
        safeSessionSet(LIST_KEY, deduped);
        setProduct(p);
        setLoading(false);
      } catch (e: any) {
        setError(e?.message || "Failed to load product");
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    if (id) void load(false);
    return () => acRef.current?.abort();
  }, [id, load]);

  return { product, loading, error, reload: () => load(true) };
}

/* ------------------------------------------------------------------ */
/* Optional convenience helpers                                        */
/* ------------------------------------------------------------------ */

export function getCachedProduct(id: string): Product | undefined {
  return memory.map.get(String(id));
}

export function primeProductsCache(list: Product[]) {
  const deduped = dedupeById(list);
  cacheListToMemory(deduped);
  safeSessionSet(LIST_KEY, deduped);
}

/* ---- Compatibility alias (keep named + allow default imports) ---- */
export default useProducts;
