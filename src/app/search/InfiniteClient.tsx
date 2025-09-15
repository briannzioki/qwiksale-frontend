"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProductCard from "@/app/components/ProductCard";
import ServiceCard from "@/app/components/ServiceCard";
import InfiniteLoader from "@/app/components/InfiniteLoader";

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
  name: string;
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
  verifiedOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort: "top" | "new" | "price_asc" | "price_desc";
  pageSize: number;
  type: "product" | "service";
};

type Props = {
  /** "/api/products/search" or "/api/services/search" */
  endpoint: string;
  /** Initial page rendered by the server (page 1) */
  initial: Envelope<ProductHit> | Envelope<ServiceHit>;
  /** Filter params to reuse when fetching more pages */
  params: BaseParams;
};

/* ------------------------------ util ------------------------------ */

function buildQS(params: Record<string, unknown>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "boolean") q.set(k, v ? "1" : "0");
    else q.set(k, String(v));
  }
  return q.toString();
}

/* ---------------------------- component --------------------------- */

export function InfiniteClient({ endpoint, initial, params }: Props) {
  const isProduct = params.type === "product";

  // track IDs to avoid duplicates
  const idsRef = useRef<Set<string>>(new Set(initial.items.map((i: any) => String(i.id))));

  // list state
  const [pages, setPages] = useState<Array<ProductHit[] | ServiceHit[]>>([initial.items]);
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
        verifiedOnly: params.verifiedOnly ? 1 : undefined,
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

      // Specific handling for rate limit
      if (res.status === 429) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error || "You’re loading too fast. Please wait.");
        setTimeout(() => setError(null), 3000);
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

      setPages((prev) => (fresh.length ? [...prev, fresh] : prev));
      setPage(data.page);
      setTotalPages(data.totalPages);
      if (data.page >= data.totalPages) setDone(true);
    } catch (e: any) {
      if (e?.name === "AbortError") return; // ignore aborted
      setError("Network error. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [endpoint, page, totalPages, params, loading, done]);

  // Setup IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    if (ioRef.current) ioRef.current.disconnect();

    ioRef.current = new IntersectionObserver(
      (entries) => {
        if (done || loading) return;
        for (const e of entries) {
          if (e.isIntersecting) {
            fetchNext();
            break;
          }
        }
      },
      { rootMargin: "600px 0px" }
    );

    ioRef.current.observe(el);
    return () => {
      ioRef.current?.disconnect();
      ioRef.current = null;
    };
  }, [fetchNext, done, loading]);

  // Cleanup in-flight on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return (
    <>
      {/* Pages 2+ render here (page 1 was SSR in the server page) */}
      {items.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {items.map((it, idx) =>
            isProduct ? (
              <ProductCard
                key={(it as ProductHit).id}
                id={(it as ProductHit).id}
                name={(it as ProductHit).name}
                image={(it as ProductHit).image ?? null}
                price={(it as ProductHit).price === 0 ? null : (it as ProductHit).price ?? null}
                {...(typeof (it as ProductHit).featured === "boolean"
                  ? { featured: (it as ProductHit).featured }
                  : {})}
                position={idx + 1}
              />
            ) : (
              <ServiceCard
                key={(it as ServiceHit).id}
                id={(it as ServiceHit).id}
                name={(it as ServiceHit).name}
                image={(it as ServiceHit).image ?? null}
                price={(it as ServiceHit).price ?? null}
                {...((it as ServiceHit).rateType ? { rateType: (it as ServiceHit).rateType } : {})}
                {...(((it as ServiceHit).serviceArea != null)
                  ? { serviceArea: (it as ServiceHit).serviceArea }
                  : {})}
                {...(((it as ServiceHit).availability != null)
                  ? { availability: (it as ServiceHit).availability }
                  : {})}
                {...(typeof (it as ServiceHit).featured === "boolean"
                  ? { featured: (it as ServiceHit).featured }
                  : {})}
              />
            )
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
          {error}
        </div>
      )}

      {/* Loader + sentinel — matches your InfiniteLoader API: { onLoad, disabled? } */}
      <div ref={sentinelRef} className="mt-4">
        <InfiniteLoader onLoad={fetchNext} disabled={done || loading} />
      </div>
    </>
  );
}
