// src/app/hooks/useSuggest.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SuggestionType = "name" | "brand" | "category" | "subcategory" | "service" | (string & {});
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
};

type State = {
  items: Suggestion[];
  loading: boolean;
  error: string | null;
};

function buildKey(endpoint: string, q: string, limit: number, extra?: UseSuggestOpts["extraParams"]) {
  const ep = endpoint.replace(/\?+.*/, "");
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("limit", String(limit));
  if (extra) {
    Object.entries(extra)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .forEach(([k, v]) => params.set(k, String(v)));
  }
  return `${ep}?${params.toString()}`;
}

export function useSuggest({
  endpoint,
  debounceMs = 200,
  minLength = 2,
  limit = 10,
  extraParams,
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

  const key = useMemo(() => buildKey(endpoint, query.trim(), limit, extraParams), [endpoint, query, limit, extraParams]);
  const canFetch = query.trim().length >= Math.max(0, minLength);

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
    setState({ items: [], loading: false, error: null });
  }, [cancel]);

  const fetchNow = useCallback(async () => {
    const q = query.trim();
    if (!q || q.length < Math.max(0, minLength)) {
      setState((s) => ({ ...s, items: [], loading: false, error: null }));
      return;
    }

    const cached = cacheRef.current.get(key);
    if (cached) {
      setState({ items: cached, loading: false, error: null });
      return;
    }

    cancel();
    const ac = new AbortController();
    abortRef.current = ac;

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const res = await fetch(key, { signal: ac.signal, headers: { "Accept": "application/json" } });
      const json = (await res.json().catch(() => ({}))) as { items?: Suggestion[]; error?: string };
      if (!res.ok) throw new Error(json?.error || `Suggest request failed (${res.status})`);
      const list = Array.isArray(json.items) ? (json.items as Suggestion[]) : [];
      cacheRef.current.set(key, list);
      setState({ items: list, loading: false, error: null });
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setState({ items: [], loading: false, error: e?.message || "Suggest error" });
    }
  }, [key, minLength, query, cancel]);

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
