"use client";
// src/app/search/InfiniteClient.tsx

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InfiniteLoader from "@/app/components/InfiniteLoader";
import type { Sort } from "./SearchClient";

/* ------------------------------ Types ------------------------------ */

type FeaturedTier = "basic" | "gold" | "diamond";

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

  /** Common seller snapshot fields (if API includes them) */
  sellerId?: string | null;
  sellerUsername?: string | null;
  sellerName?: string | null;

  /** Optional seller/account flags (if API includes them) */
  sellerVerified?: boolean | null;
  sellerFeaturedTier?: FeaturedTier | null;
  seller?: {
    id?: string | null;
    username?: string | null;
    name?: string | null;
    image?: string | null;
    verified?: boolean | null;
    featuredTier?: FeaturedTier | string | null;
  } | null;
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

  /** Common seller snapshot fields (if API includes them) */
  sellerId?: string | null;
  sellerUsername?: string | null;
  sellerName?: string | null;

  /** Optional seller/account flags (if API includes them) */
  sellerVerified?: boolean | null;
  sellerFeaturedTier?: FeaturedTier | null;
  seller?: {
    id?: string | null;
    username?: string | null;
    name?: string | null;
    image?: string | null;
    verified?: boolean | null;
    featuredTier?: FeaturedTier | string | null;
  } | null;
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

  /**
   * If your server page already rendered page 1 results,
   * set this to false to avoid duplicates.
   */
  renderInitial?: boolean;
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

function coerceFeaturedTier(v: unknown): FeaturedTier | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("diamond")) return "diamond";
  if (s.includes("gold")) return "gold";
  if (s.includes("basic")) return "basic";
  return null;
}

function pickSellerVerified(raw: any): boolean | null {
  if (!raw || typeof raw !== "object") return null;

  const seller = raw?.seller ?? raw?.user ?? raw?.owner ?? null;

  const candidates: unknown[] = [
    raw?.sellerVerified,
    raw?.seller_verified,
    raw?.accountVerified,
    raw?.account_verified,
    seller?.verified,
    seller?.isVerified,
  ];

  for (const c of candidates) {
    if (typeof c === "boolean") return c;
  }

  const hasSellerContext = Boolean(
    raw?.sellerId || raw?.sellerName || raw?.seller || raw?.user || raw?.owner || seller,
  );

  if (hasSellerContext && typeof raw?.verified === "boolean") {
    return raw.verified;
  }

  return null;
}

function pickSellerFeaturedTier(raw: any): FeaturedTier | null {
  if (!raw || typeof raw !== "object") return null;

  const seller = raw?.seller ?? raw?.user ?? raw?.owner ?? null;

  const candidates: unknown[] = [
    seller?.featuredTier,
    seller?.featured_tier,
    seller?.tier,
    seller?.featuredLevel,
    raw?.sellerFeaturedTier,
    raw?.seller_featured_tier,
    raw?.accountFeaturedTier,
    raw?.account_featured_tier,
    raw?.featuredTier,
    raw?.featured_tier,
  ];

  for (const c of candidates) {
    const t = coerceFeaturedTier(c);
    if (t) return t;
  }

  return null;
}

function pickSellerUsername(raw: any): string | null {
  if (!raw || typeof raw !== "object") return null;
  const seller = raw?.seller ?? raw?.user ?? raw?.owner ?? null;

  const candidates: unknown[] = [
    raw?.sellerUsername,
    raw?.seller_username,
    raw?.username,
    seller?.username,
    seller?.handle,
  ];

  for (const c of candidates) {
    if (typeof c === "string") {
      const s = c.trim();
      if (s) return s;
    }
  }
  return null;
}

function pickSellerId(raw: any): string | null {
  if (!raw || typeof raw !== "object") return null;
  const seller = raw?.seller ?? raw?.user ?? raw?.owner ?? null;

  const candidates: unknown[] = [
    raw?.sellerId,
    raw?.seller_id,
    raw?.accountId,
    raw?.account_id,
    raw?.userId,
    raw?.user_id,
    seller?.id,
    seller?.userId,
    seller?.user_id,
  ];

  for (const c of candidates) {
    if (typeof c === "string" || typeof c === "number") {
      const s = String(c).trim();
      if (s) return s;
    }
  }
  return null;
}

function pickStoreSlug(raw: any): string | null {
  const username = pickSellerUsername(raw);
  if (username) return username;

  const id = pickSellerId(raw);
  if (!id) return null;

  return id.startsWith("u-") ? id : `u-${id}`;
}

function pickSellerLabel(raw: any): string {
  const username = pickSellerUsername(raw);
  if (username) return `@${username}`;

  const seller = raw?.seller ?? raw?.user ?? raw?.owner ?? null;
  const nameCandidates: unknown[] = [
    raw?.sellerName,
    raw?.seller_name,
    seller?.name,
    seller?.displayName,
  ];
  for (const c of nameCandidates) {
    if (typeof c === "string") {
      const s = c.trim();
      if (s) return s;
    }
  }

  const slug = pickStoreSlug(raw);
  return slug || "Seller";
}

function storeHrefFrom(raw: any): string | null {
  const slug = pickStoreSlug(raw);
  return slug ? `/store/${encodeURIComponent(slug)}` : null;
}

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "—";
  return `KES ${n.toLocaleString("en-KE")}`;
}

function SellerBadgesRow({
  verified,
  tier,
}: {
  verified?: boolean | null;
  tier?: FeaturedTier | null;
}) {
  const showVerified = typeof verified === "boolean";
  const showTier = !!tier;
  if (!showVerified && !showTier) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {showVerified ? (
        verified ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200">
            <span aria-hidden>✓</span>
            <span>Verified</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
            <span aria-hidden>!</span>
            <span>Unverified</span>
          </span>
        )
      ) : null}

      {tier ? (
        tier === "gold" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-yellow-300 bg-gradient-to-r from-yellow-200 via-yellow-100 to-yellow-300 px-2 py-0.5 text-[11px] font-semibold text-yellow-950 dark:border-yellow-900/40 dark:from-yellow-900/30 dark:via-yellow-900/10 dark:to-yellow-900/30 dark:text-yellow-100">
            <span aria-hidden>★</span>
            <span>Featured Gold</span>
          </span>
        ) : tier === "diamond" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-gradient-to-r from-sky-200 via-indigo-100 to-violet-200 px-2 py-0.5 text-[11px] font-semibold text-slate-950 dark:border-indigo-900/40 dark:from-indigo-900/30 dark:via-indigo-900/10 dark:to-indigo-900/30 dark:text-slate-100">
            <span aria-hidden>💎</span>
            <span>Featured Diamond</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
            <span aria-hidden>★</span>
            <span>Featured Basic</span>
          </span>
        )
      ) : null}
    </div>
  );
}

/* ---------------------------- Component --------------------------- */

export function InfiniteClient({ endpoint, initial, params, renderInitial = true }: Props) {
  const isProduct = params.type === "product";

  // track IDs to avoid duplicates
  const seedIds = useMemo(() => {
    const s = new Set<string>();
    const arr = Array.isArray(initial?.items) ? initial.items : [];
    for (const it of arr as any[]) s.add(String((it as any)?.id));
    return s;
  }, [initial]);

  const idsRef = useRef<Set<string>>(seedIds);

  // list state
  const [pages, setPages] = useState<Array<ProductHit[] | ServiceHit[]>>(
    renderInitial ? [((initial?.items as any) ?? [])] : [],
  );
  const [page, setPage] = useState<number>(initial?.page ?? 1);
  const [totalPages, setTotalPages] = useState<number>(initial?.totalPages ?? 1);
  const [loading, setLoading] = useState<boolean>(false);
  const [done, setDone] = useState<boolean>((initial?.page ?? 1) >= (initial?.totalPages ?? 1));
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(() => pages.flat(), [pages]);

  // sentinel + IO + cancellation
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);

  // external sentinel: [data-grid-sentinel] support
  const externalSentinelRef = useRef<Element | null>(null);
  const externalIoRef = useRef<IntersectionObserver | null>(null);
  const moRef = useRef<MutationObserver | null>(null);

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
        setError(j?.error || "You’re loading too fast. Please wait and try again.");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError("Failed to load more results. Please try again.");
        setLoading(false);
        return;
      }

      const data = (await res.json()) as Envelope<ProductHit> | Envelope<ServiceHit>;

      // De-duplicate by id
      const fresh = (Array.isArray(data.items) ? data.items : []).filter((it: any) => {
        const id = String(it?.id);
        if (idsRef.current.has(id)) return false;
        idsRef.current.add(id);
        return true;
      });

      setPages((prev) => (fresh.length ? [...prev, fresh as any] : prev));
      setPage(typeof data.page === "number" ? data.page : nextPage);
      setTotalPages(typeof data.totalPages === "number" ? data.totalPages : totalPages);
      if ((typeof data.page === "number" ? data.page : nextPage) >= (data.totalPages ?? totalPages)) {
        setDone(true);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") setError("Network error. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [endpoint, page, totalPages, params, loading, done]);

  const onRetry = useCallback(() => {
    setError(null);
    fetchNext();
  }, [fetchNext]);

  // Internal sentinel (our own <InfiniteLoader /> wrapper)
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    ioRef.current?.disconnect();

    ioRef.current = new IntersectionObserver(
      (entries) => {
        if (done || loading || !!error) return;
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
      { rootMargin: "600px 0px" },
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
  }, [fetchNext, done, loading, error]);

  // External sentinel support: observe any [data-grid-sentinel] emitted by ProductGrid/ServiceGrid
  useEffect(() => {
    const attach = (el: Element) => {
      if (externalSentinelRef.current === el) return;
      externalIoRef.current?.disconnect();

      externalIoRef.current = new IntersectionObserver(
        (entries) => {
          if (done || loading || !!error) return;
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
        { rootMargin: "800px 0px" },
      );

      externalIoRef.current.observe(el);
      externalSentinelRef.current = el;
    };

    const initialEl =
      typeof document !== "undefined" ? document.querySelector("[data-grid-sentinel]") : null;
    if (initialEl) attach(initialEl);

    if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
      moRef.current?.disconnect();
      moRef.current = new MutationObserver(() => {
        if (externalSentinelRef.current) return;
        const el = document.querySelector("[data-grid-sentinel]");
        if (el) attach(el);
      });
      moRef.current.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      externalIoRef.current?.disconnect();
      externalIoRef.current = null;
      externalSentinelRef.current = null;
      moRef.current?.disconnect();
      moRef.current = null;
    };
  }, [fetchNext, done, loading, error]);

  // Cleanup in-flight on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <>
      {(renderInitial ? (initial?.items?.length ?? 0) : items.length) > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(renderInitial ? items : items).map((it: any) => {
            if (isProduct) {
              const p = it as ProductHit;
              const href = `/product/${encodeURIComponent(String(p.id))}`;
              const hasPrice = typeof p.price === "number" && p.price > 0;

              const sellerVerified = pickSellerVerified(p as any);
              const sellerTier = pickSellerFeaturedTier(p as any);

              const storeHref = storeHrefFrom(p as any);
              const sellerLabel = storeHref ? pickSellerLabel(p as any) : null;

              return (
                <div
                  key={`p-${p.id}`}
                  className="group h-full overflow-hidden rounded-2xl border border-border bg-card/90 shadow-sm transition hover:border-brandBlue/70 hover:bg-card"
                >
                  <Link
                    href={href}
                    prefetch={false}
                    aria-label={`Product: ${p.name}`}
                    className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div
                      className="relative overflow-hidden bg-muted"
                      style={{ aspectRatio: "4 / 3" }}
                    >
                      {p.image ? (
                        <img
                          src={p.image}
                          alt={p.name}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-wide text-muted-foreground">
                          No photo
                        </div>
                      )}
                    </div>

                    <div className="p-3">
                      <div className="line-clamp-1 text-sm font-semibold text-foreground">
                        {p.name}
                      </div>

                      <SellerBadgesRow verified={sellerVerified} tier={sellerTier} />

                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="line-clamp-1">{p.category || p.subcategory || "—"}</span>
                        <span>{hasPrice ? fmtKES(p.price) : "—"}</span>
                      </div>
                    </div>
                  </Link>

                  {storeHref && (
                    <div className="border-t border-border px-3 py-2">
                      <Link
                        href={storeHref}
                        prefetch={false}
                        className="inline-flex items-center gap-2 text-xs font-semibold text-brandBlue hover:underline"
                        aria-label={`View seller: ${sellerLabel || "Seller"}`}
                      >
                        <span className="truncate">{sellerLabel}</span>
                      </Link>
                    </div>
                  )}
                </div>
              );
            }

            const s = it as ServiceHit;
            const name = s.name ?? s.title ?? "Service";
            const href = `/service/${encodeURIComponent(String(s.id))}`;

            const hasPrice = typeof s.price === "number" && s.price > 0;
            const sellerVerified = pickSellerVerified(s as any);
            const sellerTier = pickSellerFeaturedTier(s as any);

            const storeHref = storeHrefFrom(s as any);
            const sellerLabel = storeHref ? pickSellerLabel(s as any) : null;

            return (
              <div
                key={`s-${s.id}`}
                className="group h-full overflow-hidden rounded-2xl border border-border bg-card/90 shadow-sm transition hover:border-brandBlue/70 hover:bg-card"
              >
                <Link
                  href={href}
                  prefetch={false}
                  aria-label={`Service: ${name}`}
                  className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="relative overflow-hidden bg-muted" style={{ aspectRatio: "4 / 3" }}>
                    {s.image ? (
                      <img
                        src={s.image}
                        alt={name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-wide text-muted-foreground">
                        No photo
                      </div>
                    )}
                  </div>

                  <div className="p-3">
                    <div className="line-clamp-1 text-sm font-semibold text-foreground">{name}</div>

                    <SellerBadgesRow verified={sellerVerified} tier={sellerTier} />

                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="line-clamp-1">{s.serviceArea || s.availability || "—"}</span>
                      <span>{hasPrice ? fmtKES(s.price) : "—"}</span>
                    </div>
                  </div>
                </Link>

                {storeHref && (
                  <div className="border-t border-border px-3 py-2">
                    <Link
                      href={storeHref}
                      prefetch={false}
                      className="inline-flex items-center gap-2 text-xs font-semibold text-brandBlue hover:underline"
                      aria-label={`View seller: ${sellerLabel || "Seller"}`}
                    >
                      <span className="truncate">{sellerLabel}</span>
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200"
        >
          <span>{error}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md border border-amber-300 bg-white/80 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-white dark:border-amber-800/60 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-900/30"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div ref={sentinelRef} className="mt-4">
        <InfiniteLoader onLoadAction={fetchNext} disabled={done || loading || !!error} />
      </div>
    </>
  );
}
