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

type ApiListResponse =
  | Product[]
  | {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      items: Product[];
    }
  | { error: string };

type ApiItemResponse = Product | { error: string };

export type UseProductsReturn = {
  products: Product[];
  ready: boolean;
  error?: string | null;
  reload: () => void;
};

/* ------------------------------------------------------------------ */
/* In-memory + session cache                                           */
/* ------------------------------------------------------------------ */

const LIST_KEY = "qs_products_list_v1"; // sessionStorage key
const CACHE_TTL_MS = 60_000; // 60s stale-while-revalidate
const DEFAULT_PAGE_SIZE = 60; // show more upfront; reduces "not found" on detail pages

const memory = {
  list: [] as Product[],
  map: new Map<string, Product>(),
  lastAt: 0,
};

function cacheListToMemory(list: Product[]) {
  memory.list = list;
  memory.map = new Map(list.map((p) => [String(p.id), p]));
  memory.lastAt = Date.now();
}

function loadListFromSession(): Product[] | null {
  try {
    const raw = sessionStorage.getItem(LIST_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as Product[]) : null;
  } catch {
    return null;
  }
}

function saveListToSession(list: Product[]) {
  try {
    sessionStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch {
    // ignore quota errors
  }
}

function normalizeList(resp: ApiListResponse): Product[] {
  if (Array.isArray(resp)) return resp;
  if (resp && typeof resp === "object" && "items" in resp && Array.isArray((resp as any).items)) {
    return (resp as any).items as Product[];
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* Fetch helpers                                                       */
/* ------------------------------------------------------------------ */

async function fetchList(signal?: AbortSignal): Promise<Product[]> {
  const qs = new URLSearchParams({
    page: "1",
    pageSize: String(DEFAULT_PAGE_SIZE),
  });

  const res = await fetch(`/api/products?${qs.toString()}`, {
    cache: "no-store",
    signal,
  });

  let json: ApiListResponse;
  try {
    json = (await res.json()) as ApiListResponse;
  } catch {
    throw new Error(`Bad response (${res.status})`);
  }

  if (!res.ok) {
    const msg = (json as any)?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  const items = normalizeList(json);
  return dedupeById(items);
}

async function fetchItem(id: string, signal?: AbortSignal): Promise<Product> {
  const res = await fetch(`/api/products/${encodeURIComponent(id)}`, {
    cache: "no-store",
    signal,
  });
  let json: ApiItemResponse;
  try {
    json = (await res.json()) as ApiItemResponse;
  } catch {
    throw new Error(`Bad response (${res.status})`);
  }
  if (!res.ok || (json as any)?.error) {
    throw new Error((json as any)?.error || `Not found (${res.status})`);
  }
  return json as Product;
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
/* Public hooks                                                        */
/* ------------------------------------------------------------------ */

/**
 * useProducts()
 * - Returns cached list quickly (memory/session)
 * - Revalidates in background
 * - Revalidates on tab focus / online
 */
export function useProducts(): UseProductsReturn {
  const [products, setProducts] = useState<Product[]>(memory.list);
  const [ready, setReady] = useState<boolean>(memory.list.length > 0);
  const [error, setError] = useState<string | null>(null);
  const acRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (force = false) => {
      setError(null);

      // Use memory cache if fresh and not forced
      const fresh = Date.now() - memory.lastAt < CACHE_TTL_MS;
      if (!force && memory.list.length && fresh) {
        setProducts(memory.list);
        setReady(true);
        // Also kick a silent revalidate in the background
        void revalidateSilently();
        return;
      }

      // Try session cache for a fast first paint
      if (!memory.list.length && !force) {
        const sessionList = loadListFromSession();
        if (sessionList && sessionList.length) {
          cacheListToMemory(sessionList);
          setProducts(sessionList);
          setReady(true);
          // background revalidate
          void revalidateSilently();
          return;
        }
      }

      // Network fetch
      acRef.current?.abort();
      acRef.current = new AbortController();

      try {
        const list = await fetchList(acRef.current.signal);
        cacheListToMemory(list);
        saveListToSession(list);
        setProducts(list);
        setReady(true);
      } catch (e: any) {
        setError(e?.message || "Failed to load products");
        setProducts([]);
        setReady(true);
      }
    },
    []
  );

  // background revalidate with small retry
  const revalidateSilently = useCallback(async () => {
    try {
      const list = await fetchList();
      cacheListToMemory(list);
      saveListToSession(list);
      setProducts(list);
    } catch {
      // no-op (silent)
    }
  }, []);

  // Initial load
  useEffect(() => {
    void load(false);
    // Revalidate when window regains focus or comes online
    const onFocus = () => void revalidateSilently();
    const onOnline = () => void revalidateSilently();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      acRef.current?.abort();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(() => {
    void load(true);
  }, [load]);

  return { products, ready, error, reload };
}

/**
 * useProduct(id)
 * - Returns a single product from cache immediately if present.
 * - Always attempts to fetch the authoritative product and updates caches.
 * - Useful for product detail pages to avoid "not found on page 1" issues.
 */
export function useProduct(id: string) {
  const [product, setProduct] = useState<Product | null>(
    id ? memory.map.get(String(id)) ?? null : null
  );
  const [loading, setLoading] = useState<boolean>(!product);
  const [error, setError] = useState<string | null>(null);
  const acRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (force = false) => {
      if (!id) return;

      setError(null);

      // If we already have it and not forcing, show it instantly
      if (!force && memory.map.has(String(id))) {
        setProduct(memory.map.get(String(id)) || null);
        setLoading(false);
      } else {
        setLoading(true);
      }

      // Network fetch
      acRef.current?.abort();
      acRef.current = new AbortController();

      try {
        const p = await fetchItem(id, acRef.current.signal);
        // Update memory & session list (if present)
        memory.map.set(String(p.id), p);
        const merged = dedupeById([p, ...memory.list]);
        cacheListToMemory(merged);
        saveListToSession(merged);
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
  saveListToSession(deduped);
}
