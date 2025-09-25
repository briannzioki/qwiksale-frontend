// src/app/components/ProductGrid.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProductCard from "@/app/components/ProductCard";
import type { Filters } from "@/app/components/FiltersBar";

type ApiItem = {
  id: string;
  name: string;
  price: number | null;
  image: string | null;
  featured?: boolean | null;
  createdAt?: string;
};

type ApiResponse = {
  items: ApiItem[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
  pageSize: number;
};

type Props = {
  filters: Filters;              // from FiltersBar
  pageSize?: number;             // defaults to 24
  prefetchCards?: boolean;       // pass through to <Link prefetch>
  className?: string;
  emptyText?: string;
};

function buildQuery(filters: Filters, pageSize: number, cursor?: string | null) {
  const params = new URLSearchParams();
  if (filters.query?.trim()) params.set("q", filters.query.trim());
  if (filters.condition && filters.condition !== "all") params.set("condition", filters.condition);
  if (typeof filters.minPrice === "number") params.set("minPrice", String(filters.minPrice));
  if (typeof filters.maxPrice === "number") params.set("maxPrice", String(filters.maxPrice));
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.verifiedOnly) params.set("featured", "true");
  params.set("pageSize", String(pageSize));
  if (cursor) params.set("cursor", cursor);
  return `/api/products?${params.toString()}`;
}

export default function ProductGrid({
  filters,
  pageSize = 24,
  prefetchCards = true,
  className = "",
  emptyText = "No items found. Try adjusting filters.",
}: Props) {
  const [items, setItems] = useState<ApiItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when filters change
  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    setHasMore(false);
    setError(null);
  }, [filters, pageSize]);

  const fetchPage = useCallback(
    async (cursor?: string | null) => {
      setLoading(true);
      setError(null);
      const url = buildQuery(filters, pageSize, cursor);
      const ac = new AbortController();
      try {
        const r = await fetch(url, { cache: "no-store", signal: ac.signal });
        const j = (await r.json().catch(() => ({}))) as Partial<ApiResponse>;
        if (!r.ok) throw new Error((j as any)?.error || `Failed to load (${r.status})`);

        const newItems = Array.isArray(j.items) ? (j.items as ApiItem[]) : [];
        setItems((prev) => {
          // de-dup by id (in case filters change mid-flight)
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...newItems.filter((it) => !seen.has(it.id))];
        });
        setNextCursor(j.nextCursor ?? null);
        setHasMore(Boolean(j.hasMore));
      } catch (e: any) {
        if (e?.name !== "AbortError") setError(e?.message || "Failed to fetch products");
      } finally {
        setLoading(false);
      }
      return () => ac.abort();
    },
    [filters, pageSize]
  );

  // Initial load on mount / filters change
  useEffect(() => {
    void fetchPage(null);
  }, [fetchPage]);

  // Optional auto-load when near the bottom (IntersectionObserver on a sentinel)
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !loading && hasMore) {
            void fetchPage(nextCursor);
            break;
          }
        }
      },
      { rootMargin: "600px 0px" }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, fetchPage, nextCursor]);

  const content = useMemo(() => {
    if (error) {
      return <div className="text-sm text-red-600">{error}</div>;
    }
    if (!loading && items.length === 0) {
      return <div className="text-sm text-gray-600 dark:text-slate-300">{emptyText}</div>;
    }
    return null;
  }, [error, loading, items.length, emptyText]);

  return (
    <div className={className}>
      {/* Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((p, idx) => (
          <ProductCard
            key={p.id}
            id={p.id}
            name={p.name}
            price={p.price ?? null}
            image={p.image ?? null}
            featured={Boolean(p.featured)}
            position={idx}
            prefetch={prefetchCards}
          />
        ))}

        {/* Skeletons while loading first page */}
        {items.length === 0 && loading &&
          Array.from({ length: pageSize }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="rounded-xl border bg-white p-3 shadow-sm dark:border-white/10 dark:bg-gray-900"
            >
              <div className="h-40 w-full rounded-lg bg-gray-200 dark:bg-slate-800 animate-pulse" />
              <div className="mt-2 h-4 w-3/4 rounded bg-gray-200 dark:bg-slate-800 animate-pulse" />
              <div className="mt-1 h-4 w-1/2 rounded bg-gray-200 dark:bg-slate-800 animate-pulse" />
            </div>
          ))}
      </div>

      {/* Status / errors / empty */}
      <div className="mt-4">{content}</div>

      {/* Load more button (in addition to auto-sentinel) */}
      {hasMore && (
        <div className="mt-4 flex items-center justify-center">
          <button
            onClick={() => void fetchPage(nextCursor)}
            disabled={loading}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {/* Sentinel for auto-load */}
      <div ref={sentinelRef} className="h-1 w-full" />
    </div>
  );
}
