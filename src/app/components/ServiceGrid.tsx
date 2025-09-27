// src/app/components/ServiceGrid.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Filters } from "@/app/components/FiltersBar";

type ApiItem = {
  id: string;
  name: string;
  price: number | null;
  image: string | null;
  featured?: boolean | null;
  category?: string | null;
  subcategory?: string | null;
  location?: string | null;
  createdAt?: string | null;
};

type ApiResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: ApiItem[];
};

type Props = {
  filters: Filters;        // we’ll ignore product-only fields like `condition`
  pageSize?: number;       // defaults to 24
  prefetchCards?: boolean; // pass through to <Link prefetch>
  className?: string;
  emptyText?: string;
};

const FALLBACK_IMG = "/placeholder/default.jpg";
const fmtKES = (n?: number | null) =>
  typeof n === "number" && n > 0
    ? `KES ${new Intl.NumberFormat("en-KE").format(n)}`
    : "Contact for price";

function shimmer(width: number, height: number) {
  const svg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <defs>
      <linearGradient id="g">
        <stop stop-color="#eee" offset="20%" />
        <stop stop-color="#ddd" offset="50%" />
        <stop stop-color="#eee" offset="70%" />
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="#eee" />
    <rect id="r" width="${width}" height="${height}" fill="url(#g)" />
    <animate xlink:href="#r" attributeName="x" from="-${width}" to="${width}" dur="1.2s" repeatCount="indefinite" />
  </svg>`;
  const encode =
    typeof window === "undefined"
      ? (s: string) => Buffer.from(s, "utf8").toString("base64")
      : (s: string) => btoa(s);
  return `data:image/svg+xml;base64,${encode(svg)}`;
}

function buildQuery(filters: Filters, pageSize: number, page: number) {
  const params = new URLSearchParams();
  if (filters.query?.trim()) params.set("q", filters.query.trim());
  // Services ignore `condition`/`brand` — just price/sort/featured
  if (typeof filters.minPrice === "number") params.set("minPrice", String(filters.minPrice));
  if (typeof filters.maxPrice === "number") params.set("maxPrice", String(filters.maxPrice));
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.verifiedOnly) params.set("featured", "true");
  params.set("pageSize", String(pageSize));
  params.set("page", String(page));
  return `/api/services?${params.toString()}`;
}

export default function ServiceGrid({
  filters,
  pageSize = 24,
  prefetchCards = true,
  className = "",
  emptyText = "No services found. Try adjusting filters.",
}: Props) {
  const [items, setItems] = useState<ApiItem[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when filters change
  useEffect(() => {
    setItems([]);
    setPage(1);
    setTotalPages(1);
    setHasMore(false);
    setError(null);
  }, [filters, pageSize]);

  const fetchPage = useCallback(
    async (p: number) => {
      setLoading(true);
      setError(null);
      const url = buildQuery(filters, pageSize, p);
      const ac = new AbortController();
      try {
        const r = await fetch(url, { cache: "no-store", signal: ac.signal });
        const j = (await r.json().catch(() => ({}))) as Partial<ApiResponse>;
        if (!r.ok) throw new Error((j as any)?.error || `Failed to load (${r.status})`);

        const newItems = Array.isArray(j.items) ? (j.items as ApiItem[]) : [];
        setItems((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          return [...prev, ...newItems.filter((it) => !seen.has(it.id))];
        });

        const tp = Number(j.totalPages ?? 1) || 1;
        setTotalPages(tp);
        setHasMore(p < tp);
        setPage(p); // lock in the current page we just fetched
      } catch (e: any) {
        if (e?.name !== "AbortError") setError(e?.message || "Failed to fetch services");
      } finally {
        setLoading(false);
      }
      return () => ac.abort();
    },
    [filters, pageSize]
  );

  // Initial load or on reset
  useEffect(() => {
    void fetchPage(1);
  }, [fetchPage]);

  // Auto-load the next page when sentinel enters viewport
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !loading && hasMore) {
            void fetchPage(page + 1);
            break;
          }
        }
      },
      { rootMargin: "600px 0px" }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, fetchPage, page]);

  const content = useMemo(() => {
    if (error) return <div className="text-sm text-red-600">{error}</div>;
    if (!loading && items.length === 0)
      return <div className="text-sm text-gray-600 dark:text-slate-300">{emptyText}</div>;
    return null;
  }, [error, loading, items.length, emptyText]);

  return (
    <div className={className}>
      {/* Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((s, idx) => {
          const blur = shimmer(800, 440);
          const categoryText = [s.category ?? "", s.subcategory ?? ""]
            .filter(Boolean)
            .join(" • ") || "—";

          return (
            <Link key={s.id} href={`/service/${s.id}`} prefetch={prefetchCards} className="group">
              <div className="relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
                {s.featured ? (
                  <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
                    Featured
                  </span>
                ) : null}
                <div className="relative">
                  <Image
                    alt={s.name || "Service image"}
                    src={s.image || FALLBACK_IMG}
                    width={800}
                    height={440}
                    className="h-44 w-full object-cover bg-gray-100 dark:bg-slate-800"
                    placeholder="blur"
                    blurDataURL={blur}
                    priority={false}
                    unoptimized={Boolean((s.image as string | null)?.endsWith?.(".svg"))}
                    onError={(e) => {
                      const img = e.currentTarget as HTMLImageElement;
                      if (img && img.src !== FALLBACK_IMG) img.src = FALLBACK_IMG;
                    }}
                    loading="lazy"
                  />
                </div>
                <div className="p-4">
                  <h3 className="line-clamp-1 font-semibold text-gray-900 dark:text-white">
                    {s.name || "Unnamed service"}
                  </h3>
                  <p className="line-clamp-1 text-xs text-gray-500 dark:text-slate-400">
                    {categoryText}
                  </p>
                  <p className="mt-1 font-bold text-[#161748] dark:text-brandBlue">
                    {fmtKES(s.price)}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}

        {/* Skeletons while loading first page */}
        {items.length === 0 &&
          loading &&
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
            onClick={() => void fetchPage(page + 1)}
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
