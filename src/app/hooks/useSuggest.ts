// src/app/hooks/useSuggest.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SuggestionType =
  | "name"
  | "brand"
  | "category"
  | "subcategory"
  | "service"
  | (string & {});
export type Suggestion = { label: string; value: string; type: SuggestionType };

type UseSuggestOpts = {
  /** API endpoint that returns { items: Suggestion[] } */
  endpoint: string;
  /** Debounce before firing network requests (ms). Default 200. */
  debounceMs?: number;
  /** Minimum query length before hitting the endpoint. Default 2. */
  minLength?: number;
  /** How many suggestions to ask for. Default 10. */
  limit?: number;
  /** Extra query params appended to the request (e.g. { kind: "services" }) */
  extraParams?: Record<string, string | number | boolean | undefined>;
  /** Include same-origin cookies (if your API needs auth). Default false. */
  withCredentials?: boolean;
};

type State = {
  items: Suggestion[];
  loading: boolean;
  error: string | null;
};

const MAX_CACHE_KEYS = 64;

/** Normalize endpoint, removing trailing query string and duplicate slashes */
function normalizeEndpoint(endpoint: string) {
  const ep = endpoint.trim();
  // strip any existing query string; we always rebuild it
  const base = ep.replace(/\?+.*/, "");
  // collapse accidental double slashes except after protocol
  return base.replace(/([^:]\/)\/+/g, "$1");
}

function toSearchParams(
  q: string,
  limit: number,
  extra?: UseSuggestOpts["extraParams"]
) {
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("limit", String(limit));
  if (extra) {
    Object.entries(extra)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .forEach(([k, v]) => params.set(k, String(v)));
  }
  return params;
}

function buildKey(
  endpoint: string,
  q: string,
  limit: number,
  extra?: UseSuggestOpts["extraParams"]
) {
  const ep = normalizeEndpoint(endpoint);
  const params = toSearchParams(q, limit, extra).toString();
  return `${ep}?${params}`;
}

/** LRU-ish set: if cache too big, drop the oldest key */
function cacheSetLRU(
  cache: Map<string, Suggestion[]>,
  key: string,
  value: Suggestion[]
) {
  if (cache.has(key)) cache.delete(key); // move to end
  cache.set(key, value);
  if (cache.size > MAX_CACHE_KEYS) {
    const first = cache.keys().next().value as string | undefined;
    if (first) cache.delete(first);
  }
}

export function useSuggest({
  endpoint,
  debounceMs = 200,
  minLength = 2,
  limit = 10,
  extraParams,
  withCredentials = false,
}: UseSuggestOpts) {
  const [query, setQuery] = useState("");
  const [{ items, loading, error }, setState] = useState<State>({
    items: [],
    loading: false,
    error: null,
  });

  const cacheRef = useRef(new Map<string, Suggestion[]>());
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const trimmed = query.trim();
  const key = useMemo(
    () => buildKey(endpoint, trimmed, limit, extraParams),
    [endpoint, trimmed, limit, extraParams]
  );
  const canFetch = trimmed.length >= Math.max(0, minLength);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    cancel();
    if (!mountedRef.current) return;
    setState({ items: [], loading: false, error: null });
  }, [cancel]);

  const fetchNow = useCallback(async () => {
    const q = trimmed;
    if (!q || q.length < Math.max(0, minLength)) {
      if (!mountedRef.current) return;
      setState((s) => ({ ...s, items: [], loading: false, error: null }));
      return;
    }

    const cached = cacheRef.current.get(key);
    if (cached) {
      if (!mountedRef.current) return;
      setState({ items: cached, loading: false, error: null });
      return;
    }

    cancel();
    const ac = new AbortController();
    abortRef.current = ac;

    if (mountedRef.current) {
      setState((s) => ({ ...s, loading: true, error: null }));
    }

    try {
      const res = await fetch(key, {
        signal: ac.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
        credentials: withCredentials ? "same-origin" : "omit",
      });

      // Parse json safely
      const json = (await res
        .json()
        .catch(() => ({}))) as { items?: Suggestion[]; error?: string };

      if (!res.ok) {
        const msg =
          json?.error ||
          `Suggest request failed (${res.status}${res.statusText ? " " + res.statusText : ""})`;
        throw new Error(msg);
      }

      const list = Array.isArray(json.items) ? (json.items as Suggestion[]) : [];
      cacheSetLRU(cacheRef.current, key, list);

      if (!mountedRef.current) return;
      setState({ items: list, loading: false, error: null });
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      if (!mountedRef.current) return;
      setState({
        items: [],
        loading: false,
        error: e?.message || "Suggest error",
      });
    }
  }, [key, minLength, trimmed, cancel, withCredentials]);

  useEffect(() => {
    if (!canFetch) {
      clear();
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fetchNow, Math.max(0, debounceMs));
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [fetchNow, debounceMs, canFetch, clear]);

  // Cancel in-flight on unmount
  useEffect(() => cancel, [cancel]);

  return {
    // inputs
    query,
    setQuery,

    // state
    items,
    loading,
    error,

    // controls
    fetchNow, // immediate fetch ignoring debounce
    clear,
    cancel,
  };
}

export default useSuggest;
