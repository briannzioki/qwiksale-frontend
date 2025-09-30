// src/app/components/ProductGrid.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import SmartImage from "@/app/components/SmartImage";
import ProductCard from "@/app/components/ProductCard";
import { shimmer as shimmerMaybe } from "@/app/lib/blur";
import type { Filters } from "@/app/components/FiltersBar";

/* --------------------------------- types --------------------------------- */

type Mode = "products" | "all";

type BaseItem = {
  id: string;
  name: string;
  price: number | null;
  image: string | null;
  featured?: boolean | null;
  createdAt?: string;
};

type ApiItem = BaseItem;

type ApiResponse = {
  items: ApiItem[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
  pageSize: number;
};

type AllItem = BaseItem & { type: "product" | "service" };

type AllResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: AllItem[];
};

type Props = {
  filters: Filters;              // from FiltersBar
  mode?: Mode;                   // "products" (default) or "all"
  pageSize?: number;             // defaults to 24
  prefetchCards?: boolean;       // pass through to <Link prefetch>
  className?: string;
  emptyText?: string;
};

/* --------------------------------- utils --------------------------------- */

const PLACEHOLDER = "/placeholder/default.jpg";

// Tiny 1×1 transparent PNG as last-resort blur
const FALLBACK_BLUR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMB9l9b3a8AAAAASUVORK5CYII=";

// Accept both shimmer(w, h) and shimmer({ width, height })
function getBlurDataURL(width = 640, height = 360): string {
  try {
    const fn: any = shimmerMaybe;
    if (typeof fn === "function") {
      if (fn.length >= 2) return fn(width, height); // (w, h)
      return fn({ width, height }); // ({ width, height })
    }
  } catch {}
  return FALLBACK_BLUR;
}

function buildProductsQuery(filters: Filters, pageSize: number, cursor?: string | null) {
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

function buildAllQuery(filters: Filters, pageSize: number, pageStr?: string | null) {
  const params = new URLSearchParams();
  params.set("t", "all");
  if (filters.query?.trim()) params.set("q", filters.query.trim());
  // All-tab ignores product-only condition; backend will ignore unknowns anyway.
  if (typeof filters.minPrice === "number") params.set("minPrice", String(filters.minPrice));
  if (typeof filters.maxPrice === "number") params.set("maxPrice", String(filters.maxPrice));
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.verifiedOnly) params.set("featured", "true");
  params.set("pageSize", String(pageSize));
  if (pageStr) params.set("page", pageStr);
  return `/api/home-feed?${params.toString()}`;
}

function fmtKES(n: number | null | undefined) {
  if (typeof n !== "number" || n <= 0) return "Contact for price";
  try {
    return `KES ${new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

/* -------------------------- simple mixed item tile ------------------------- */

function MixedTile({
  it,
  index,
  prefetch,
}: {
  it: AllItem;
  index: number;
  prefetch: boolean;
}) {
  const href = it.type === "service" ? `/service/${it.id}` : `/product/${it.id}`;
  const url = it.image || PLACEHOLDER;

  const priority = index < 8;
  const blurProps =
    priority
      ? ({ placeholder: "blur", blurDataURL: getBlurDataURL(640, 360) } as const)
      : ({ placeholder: "empty" } as const);

  const alt =
    it.name
      ? `${it.type === "service" ? "Service" : "Product"} image for ${it.name}`
      : it.type === "service"
      ? "Service image"
      : "Product image";

  return (
    <Link href={href} prefetch={prefetch} className="group">
      <div className="relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
        {it.featured ? (
          <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
            Featured
          </span>
        ) : null}
        <div className="relative h-40 w-full bg-gray-100">
          <SmartImage
            src={url}
            alt={alt}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            priority={priority}
            {...blurProps}
          />
        </div>
        <div className="p-3">
          <h3 className="line-clamp-1 font-semibold text-gray-900 dark:text-white">{it.name}</h3>
          <p className="mt-1 font-bold text-[#161748] dark:text-brandBlue">{fmtKES(it.price)}</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
            {it.type === "service" ? "Service" : "Product"}
          </p>
        </div>
      </div>
    </Link>
  );
}

/* ---------------------------------- cmp ---------------------------------- */

export default function ProductGrid({
  filters,
  mode = "products",
  pageSize = 24,
  prefetchCards = true,
  className = "",
  emptyText = "No items found. Try adjusting filters.",
}: Props) {
  // When mode === "products", we keep the original cursor-based flow.
  // When mode === "all", we adapt "nextCursor" to be the next page (as string).
  const [items, setItems] = useState<Array<ApiItem | AllItem>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null); // cursor OR next page string
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when inputs change
  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    setHasMore(false);
    setError(null);
  }, [filters, pageSize, mode]);

  const fetchPage = useCallback(
    async (cursorOrPage?: string | null) => {
      setLoading(true);
      setError(null);

      const url =
        mode === "all"
          ? buildAllQuery(filters, pageSize, cursorOrPage ?? null)
          : buildProductsQuery(filters, pageSize, cursorOrPage ?? null);

      const ac = new AbortController();
      try {
        const r = await fetch(url, { cache: "no-store", signal: ac.signal });
        const j = await r.json().catch(() => ({}));

        if (!r.ok) {
          const msg = (j && j.error) || `Failed to load (${r.status})`;
          throw new Error(msg);
        }

        if (mode === "all") {
          const data = j as Partial<AllResponse>;
          const newItems = Array.isArray(data.items) ? (data.items as AllItem[]) : [];
          setItems((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...prev, ...newItems.filter((it) => !seen.has(it.id))];
          });

          const page = Number(data.page ?? 1);
          const totalPages = Number(data.totalPages ?? 1);
          const more = page < totalPages;
          setHasMore(more);
          setNextCursor(more ? String(page + 1) : null);
        } else {
          const data = j as Partial<ApiResponse>;
          const newItems = Array.isArray(data.items) ? (data.items as ApiItem[]) : [];
          setItems((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...prev, ...newItems.filter((it) => !seen.has(it.id))];
          });
          setNextCursor((data.nextCursor as string) ?? null);
          setHasMore(Boolean(data.hasMore));
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") setError(e?.message || "Failed to fetch items");
      } finally {
        setLoading(false);
      }

      return () => ac.abort();
    },
    [filters, pageSize, mode]
  );

  // Initial load
  useEffect(() => {
    void fetchPage(null);
  }, [fetchPage]);

  // Infinite scroll sentinel
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
    if (error) return <div className="text-sm text-red-600">{error}</div>;
    if (!loading && items.length === 0) {
      return <div className="text-sm text-gray-600 dark:text-slate-300">{emptyText}</div>;
    }
    return null;
  }, [error, loading, items.length, emptyText]);

  const isAll = mode === "all";

  return (
    <div className={className}>
      {/* Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((p, idx) =>
          isAll ? (
            <MixedTile
              key={`${(p as AllItem).type}-${p.id}`}
              it={p as AllItem}
              index={idx}
              prefetch={prefetchCards}
            />
          ) : (
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
          )
        )}

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
