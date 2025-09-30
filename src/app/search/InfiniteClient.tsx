// src/app/search/InfiniteClient.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InfiniteLoader from "@/app/components/InfiniteLoader";
import type { Sort } from "./SearchClient";

/* ------------------------------ Types ------------------------------ */

type Envelope<T> = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: T[];
};

type ProductHit = {
  id: string;
  name: string;
  image?: string | null;
  price?: number | null;
  brand?: string | null;
  condition?: string | null;
  featured?: boolean;
  category: string;
  subcategory: string | null;
};

type ServiceHit = {
  id: string;
  /** Prefer `name`, but support legacy `title`. */
  name?: string | null;
  title?: string | null;
  image?: string | null;
  price?: number | null;
  rateType?: "hour" | "day" | "fixed" | null;
  serviceArea?: string | null;
  availability?: string | null;
  featured?: boolean;
};

type BaseParams = {
  q?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  condition?: string;
  featured?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort: Sort;
  pageSize: number;
  type: "product" | "service";
};

type Props = {
  endpoint: string; // "/api/products" or "/api/services"
  initial: Envelope<ProductHit> | Envelope<ServiceHit>;
  params: BaseParams;
};

/* ------------------------------ Util ------------------------------ */

function buildQS(params: Record<string, unknown>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "boolean") q.set(k, v ? "true" : "false");
    else q.set(k, String(v));
  }
  return q.toString();
}

/* ---------------------------- Component --------------------------- */

export function InfiniteClient({ endpoint, initial, params }: Props) {
  const isProduct = params.type === "product";

  // track IDs to avoid duplicates
  const idsRef = useRef<Set<string>>(new Set(initial.items.map((i: any) => String(i.id))));

  // list state
  const [pages, setPages] = useState<Array<ProductHit[] | ServiceHit[]>>([initial.items as any]);
  const [page, setPage] = useState<number>(initial.page);
  const [totalPages, setTotalPages] = useState<number>(initial.totalPages);
  const [loading, setLoading] = useState<boolean>(false);
  const [done, setDone] = useState<boolean>(initial.page >= initial.totalPages);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(() => pages.flat(), [pages]);

  // sentinel + IO + cancellation
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const fetchNext = useCallback(async () => {
    if (loading || done) return;
    const nextPage = page + 1;
    if (nextPage > totalPages) {
      setDone(true);
      return;
    }
    setLoading(true);
    setError(null);

    // cancel any previous in-flight
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const qs = buildQS({
        q: params.q || undefined,
        category: params.category || undefined,
        subcategory: params.subcategory || undefined,
        brand: params.brand || undefined,
        condition: params.condition || undefined,
        featured: params.featured ? true : undefined,
        minPrice: typeof params.minPrice === "number" ? params.minPrice : undefined,
        maxPrice: typeof params.maxPrice === "number" ? params.maxPrice : undefined,
        sort: params.sort,
        page: nextPage,
        pageSize: params.pageSize,
      });

      const res = await fetch(`${endpoint}?${qs}`, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (res.status === 429) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error || "You’re loading too fast. Please wait.");
        window.setTimeout(() => setError(null), 3000);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError("Failed to load more results.");
        setLoading(false);
        return;
      }

      const data = (await res.json()) as Envelope<ProductHit> | Envelope<ServiceHit>;

      // De-duplicate by id
      const fresh = data.items.filter((it: any) => {
        const id = String(it.id);
        if (idsRef.current.has(id)) return false;
        idsRef.current.add(id);
        return true;
      });

      setPages((prev) => (fresh.length ? [...prev, fresh as any] : prev));
      setPage(data.page);
      setTotalPages(data.totalPages);
      if (data.page >= data.totalPages) setDone(true);
    } catch (e: any) {
      if (e?.name !== "AbortError") setError("Network error. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [endpoint, page, totalPages, params, loading, done]);

  // Setup IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    ioRef.current?.disconnect();

    ioRef.current = new IntersectionObserver(
      (entries) => {
        if (done || loading) return;
        for (const e of entries) {
          if (e.isIntersecting) {
            if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
            timeoutRef.current = window.setTimeout(() => {
              fetchNext();
              timeoutRef.current = null;
            }, 120);
            break;
          }
        }
      },
      { rootMargin: "600px 0px" }
    );

    ioRef.current.observe(el);
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      ioRef.current?.disconnect();
      ioRef.current = null;
    };
  }, [fetchNext, done, loading]);

  // Cleanup in-flight on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <>
      {/* Pages 2+ render here (page 1 was SSR in the server page) */}
      {items.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {items.map((it) => {
            if (isProduct) {
              const p = it as ProductHit;
              const href = `/product/${p.id}`;
              const hasPrice = typeof p.price === "number" && p.price > 0;
              const aria = hasPrice
                ? `Product: ${p.name} — priced at KSh ${p.price!.toLocaleString()}`
                : `Product: ${p.name}`;
              return (
                <Link
                  key={p.id}
                  href={href}
                  aria-label={aria}
                  className="group block overflow-hidden rounded-xl border bg-white shadow-sm hover:shadow-md focus:outline-none focus:ring dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="aspect-[4/3] w-full bg-gray-100 dark:bg-slate-800">
                    <div
                      className="h-full w-full"
                      style={{
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundImage: p.image ? `url(${p.image})` : "none",
                      }}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="p-3">
                    <div className="line-clamp-1 text-sm font-medium">{p.name}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-gray-600 dark:text-slate-400">
                      <span className="line-clamp-1">{p.category || p.subcategory || "—"}</span>
                      <span>{hasPrice ? `KSh ${p.price!.toLocaleString()}` : "—"}</span>
                    </div>
                  </div>
                </Link>
              );
            }

            const s = it as ServiceHit;
            const name = s.name ?? s.title ?? "Service";
            const href = `/service/${s.id}`;
            const hasPrice = typeof s.price === "number" && s.price > 0;
            const aria = `Service: ${name}`;
            return (
              <Link
                key={s.id}
                href={href}
                aria-label={aria}
                className="group block overflow-hidden rounded-xl border bg-white shadow-sm hover:shadow-md focus:outline-none focus:ring dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="aspect-[4/3] w-full bg-gray-100 dark:bg-slate-800">
                  <div
                    className="h-full w-full"
                    style={{
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      backgroundImage: s.image ? `url(${s.image})` : "none",
                    }}
                    aria-hidden="true"
                  />
                </div>
                <div className="p-3">
                  <div className="line-clamp-1 text-sm font-medium">{name}</div>
                  <div className="mt-1 flex items-center justify-between text-xs text-gray-600 dark:text-slate-400">
                    <span className="line-clamp-1">{s.serviceArea || s.availability || "—"}</span>
                    <span>{hasPrice ? `KSh ${s.price!.toLocaleString()}` : "—"}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
          {error}
        </div>
      )}

      {/* Loader + sentinel */}
      <div ref={sentinelRef} className="mt-4">
        <InfiniteLoader onLoadAction={fetchNext} disabled={done || loading} />
      </div>
    </>
  );
}
