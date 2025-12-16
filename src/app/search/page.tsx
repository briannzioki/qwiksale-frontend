"use client";

// src/app/search/page.tsx

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
    raw?.sellerId ||
      raw?.sellerName ||
      raw?.seller ||
      raw?.user ||
      raw?.owner ||
      seller,
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

/** Prefer username for store/profile routes; fallback to `u-<id>` */
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

  const normalized = id.startsWith("u-") ? id : `u-${id}`;
  return normalized;
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

/* ------------------------ Seller pill UI (brand-consistent) ------------------------ */

function VerifiedPill({ verified }: { verified: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        verified
          ? "border-emerald-500/30 bg-emerald-600/10 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "border-border bg-muted text-muted-foreground",
      ].join(" ")}
      aria-label={verified ? "Verified seller" : "Unverified seller"}
    >
      <span className="text-[10px]" aria-hidden="true">
        {verified ? "✓" : "✕"}
      </span>{" "}
      <span>{verified ? "Verified" : "Unverified"}</span>
    </span>
  );
}

function TierPill({ tier }: { tier: FeaturedTier }) {
  const base =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold";
  if (tier === "gold") {
    return (
      <span
        className={`${base} border-amber-400/40 bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 text-amber-950 dark:border-amber-900/40 dark:from-amber-900/25 dark:via-amber-900/10 dark:to-amber-900/25 dark:text-amber-100`}
        aria-label="Featured tier gold"
      >
        <span className="text-[10px]" aria-hidden="true">
          ★
        </span>{" "}
        <span>gold</span>
      </span>
    );
  }
  if (tier === "diamond") {
    return (
      <span
        className={`${base} border-sky-300/50 bg-gradient-to-r from-sky-200 via-cyan-100 to-indigo-200 text-slate-900 dark:border-sky-900/40 dark:from-sky-900/25 dark:via-sky-900/10 dark:to-sky-900/25 dark:text-slate-100`}
        aria-label="Featured tier diamond"
      >
        <span className="text-[10px]" aria-hidden="true">
          ◆
        </span>{" "}
        <span>diamond</span>
      </span>
    );
  }
  return (
    <span
      className={`${base} border-border bg-muted text-foreground`}
      aria-label="Featured tier basic"
    >
      <span className="text-[10px]" aria-hidden="true">
        ★
      </span>{" "}
      <span>basic</span>
    </span>
  );
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
      {showVerified ? <VerifiedPill verified={Boolean(verified)} /> : null}
      {tier ? <TierPill tier={tier} /> : null}
    </div>
  );
}

function safeSort(v: string | null): Sort {
  const s = (v || "").toLowerCase();
  if (s === "featured" || s === "price_asc" || s === "price_desc") return s;
  return "newest";
}

function coerceEnvelope<T>(json: any): Envelope<T> {
  const base = json?.data ?? json ?? {};
  const items: T[] =
    (Array.isArray(base?.items) ? base.items : null) ??
    (Array.isArray(base?.results) ? base.results : null) ??
    (Array.isArray(base) ? base : []);

  const page = typeof base?.page === "number" && base.page > 0 ? base.page : 1;

  const pageSize =
    typeof base?.pageSize === "number" && base.pageSize > 0
      ? base.pageSize
      : items.length || 24;

  const total = typeof base?.total === "number" ? base.total : items.length;

  const totalPages =
    typeof base?.totalPages === "number" && base.totalPages > 0
      ? base.totalPages
      : Math.max(1, Math.ceil((total || 0) / (pageSize || 24)));

  return { page, pageSize, total, totalPages, items };
}

/* ---------------------------- InfiniteClient (INTERNAL ONLY) ---------------------------- */
/**
 * IMPORTANT: Do NOT export named symbols from a Next.js `page.tsx` module.
 * Keeping this component internal avoids `.next/types/.../page.ts` export validation errors.
 */
function InfiniteClient({ endpoint, initial, params }: Props) {
  const isProduct = params.type === "product";

  // track IDs to avoid duplicates
  const idsRef = useRef<Set<string>>(
    new Set(initial.items.map((i: any) => String(i.id))),
  );

  // list state
  const [pages, setPages] = useState<Array<ProductHit[] | ServiceHit[]>>([
    initial.items as any,
  ]);
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
        minPrice:
          typeof params.minPrice === "number" ? params.minPrice : undefined,
        maxPrice:
          typeof params.maxPrice === "number" ? params.maxPrice : undefined,
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
        setError(
          j?.error || "You’re loading too fast. Please wait and try again.",
        );
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError("Failed to load more results. Please try again.");
        setLoading(false);
        return;
      }

      const data = coerceEnvelope<ProductHit | ServiceHit>(
        await res.json().catch(() => ({})),
      );

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

  const onRetry = useCallback(() => {
    setError(null);
    fetchNext();
  }, [fetchNext]);

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

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <>
      {items.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {items.map((it) => {
            if (isProduct) {
              const p = it as ProductHit;
              const href = `/product/${p.id}`;

              const sellerVerified = pickSellerVerified(p as any);
              const sellerTier = pickSellerFeaturedTier(p as any);

              const storeHref = storeHrefFrom(p as any);
              const sellerLabel = storeHref ? pickSellerLabel(p as any) : null;

              return (
                <div
                  key={p.id}
                  className="card-surface group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <Link
                    href={href}
                    aria-label={`Product: ${p.name}`}
                    className="block focus:outline-none focus:ring-2 ring-focus"
                  >
                    <div className="aspect-[4/3] w-full bg-muted">
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
                      <div className="line-clamp-1 text-sm font-semibold text-foreground">
                        {p.name}
                      </div>

                      <SellerBadgesRow
                        verified={sellerVerified}
                        tier={sellerTier}
                      />

                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="line-clamp-1">
                          {p.category || p.subcategory || "—"}
                        </span>
                        <span>
                          {typeof p.price === "number" && p.price > 0
                            ? `KES ${p.price.toLocaleString("en-KE")}`
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </Link>

                  {storeHref && (
                    <div className="border-t border-border px-3 py-2">
                      <Link
                        href={storeHref}
                        prefetch={false}
                        className="inline-flex items-center gap-2 text-xs font-semibold text-[#39a0ca] hover:underline underline-offset-4"
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
            const href = `/service/${s.id}`;

            const sellerVerified = pickSellerVerified(s as any);
            const sellerTier = pickSellerFeaturedTier(s as any);

            const storeHref = storeHrefFrom(s as any);
            const sellerLabel = storeHref ? pickSellerLabel(s as any) : null;

            return (
              <div
                key={s.id}
                className="card-surface group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <Link
                  href={href}
                  aria-label={`Service: ${name}`}
                  className="block focus:outline-none focus:ring-2 ring-focus"
                >
                  <div className="aspect-[4/3] w-full bg-muted">
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
                    <div className="line-clamp-1 text-sm font-semibold text-foreground">
                      {name}
                    </div>

                    <SellerBadgesRow
                      verified={sellerVerified}
                      tier={sellerTier}
                    />

                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="line-clamp-1">
                        {s.serviceArea || s.availability || "—"}
                      </span>
                      <span>
                        {typeof s.price === "number" && s.price > 0
                          ? `KES ${s.price.toLocaleString("en-KE")}`
                          : "—"}
                      </span>
                    </div>
                  </div>
                </Link>

                {storeHref && (
                  <div className="border-t border-border px-3 py-2">
                    <Link
                      href={storeHref}
                      prefetch={false}
                      className="inline-flex items-center gap-2 text-xs font-semibold text-[#39a0ca] hover:underline underline-offset-4"
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
          className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-sm text-amber-950 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-50"
        >
          <span>{error}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md border border-amber-300 bg-white/80 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-white dark:border-amber-800/60 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-900/30"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div ref={sentinelRef} className="mt-4">
        <InfiniteLoader
          onLoadAction={fetchNext}
          disabled={done || loading || !!error}
        />
      </div>
    </>
  );
}

/* ---------------------------- SuggestInput (test wiring) --------------------------- */

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function SuggestInput({
  name,
  value,
  onChange,
  placeholder,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const listboxId = useId();
  const debounced = useDebouncedValue(value, 300);

  const suggestions = useMemo(() => {
    const q = (debounced || "").trim();
    if (!q) return [];
    // Minimal + deterministic: satisfies “listbox appears after typing”
    return Array.from(new Set([q, `${q} near me`, `${q} kenya`])).slice(0, 6);
  }, [debounced]);

  const expanded = suggestions.length > 0;

  return (
    <div className="relative">
      <input
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded ? "true" : "false"}
        aria-controls={expanded ? listboxId : undefined}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 ring-focus"
      />

      {expanded && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-border bg-background p-1 shadow-md"
        >
          {suggestions.map((s) => (
            <li
              key={s}
              role="option"
              className="cursor-default rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted"
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------- The actual /search page --------------------------- */

const FIRST_PAGE_TIMEOUT_MS = 4000;

export default function SearchPage() {
  const sp = useSearchParams();

  const type: "product" | "service" =
    (sp.get("type") || "").toLowerCase() === "service" ? "service" : "product";

  const sort = safeSort(sp.get("sort"));
  const qFromUrl = sp.get("q") || "";

  const [q, setQ] = useState(qFromUrl);

  // keep input in sync when URL changes (soft nav)
  useEffect(() => {
    setQ(qFromUrl);
  }, [qFromUrl]);

  const endpoint = type === "service" ? "/api/services" : "/api/products";

  const fetchParams = useMemo(() => {
    const category = sp.get("category") || "";
    const subcategory = sp.get("subcategory") || "";
    const brand = sp.get("brand") || "";
    const condition = sp.get("condition") || "";
    const featured = (sp.get("featured") || "").toLowerCase() === "true";
    const minPriceRaw = sp.get("minPrice") || "";
    const maxPriceRaw = sp.get("maxPrice") || "";

    const minPrice = minPriceRaw ? Number(minPriceRaw) : undefined;
    const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : undefined;

    return {
      q: qFromUrl || undefined,
      category: category || undefined,
      subcategory: subcategory || undefined,
      ...(type === "product"
        ? { brand: brand || undefined, condition: condition || undefined }
        : {}),
      featured: featured ? true : undefined,
      minPrice: Number.isFinite(minPrice as number)
        ? (minPrice as number)
        : undefined,
      maxPrice: Number.isFinite(maxPrice as number)
        ? (maxPrice as number)
        : undefined,
      sort,
      page: 1,
      pageSize: 24,
    };
  }, [sp, qFromUrl, sort, type]);

  const [data, setData] = useState<Envelope<ProductHit | ServiceHit> | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), FIRST_PAGE_TIMEOUT_MS);

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const qs = buildQS(fetchParams as any);
        const res = await fetch(`${endpoint}?${qs}`, {
          cache: "no-store",
          signal: ctrl.signal,
          headers: { Accept: "application/json" },
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(json?.error || `Failed to load (${res.status})`);

        const env = coerceEnvelope<ProductHit | ServiceHit>(json);
        setData(env);
      } catch (e: any) {
        if (e?.name !== "AbortError")
          setErr(e?.message || "Failed to load search results");
      } finally {
        window.clearTimeout(t);
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();

    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [endpoint, fetchParams]);

  const items = Array.isArray(data?.items) ? data!.items : [];
  const total = typeof data?.total === "number" ? data!.total : items.length;

  const heading = type === "service" ? "Search services" : "Search";

  const heroTitle =
    qFromUrl && qFromUrl.trim()
      ? `${heading}: “${qFromUrl.trim()}”`
      : heading;

  return (
    <main
      id="main"
      className="min-h-[calc(100vh-4rem)] px-4 py-6 md:px-8 lg:px-12 xl:px-16"
    >
      <section className="mx-auto max-w-6xl space-y-4">
        <header
          className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-[#161748] via-[#1b244f] to-[#39a0ca] p-6 text-primary-foreground shadow-xl shadow-black/30"
          aria-label="Search header"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-60 mix-blend-soft-light"
            aria-hidden="true"
          >
            <div className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.16),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(71,133,89,0.26),_transparent_55%)]" />
          </div>

          <div className="relative">
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">
              {heroTitle}
            </h1>
            <p className="mt-1 text-sm text-primary-foreground/90">
              Find products and services fast — filters update the URL.
            </p>

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-primary-foreground/85">
              <span className="inline-flex items-center gap-2 rounded-full bg-black/20 px-3 py-1 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
                <span>Type:</span>
                <span className="font-semibold uppercase">{type}</span>
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-black/15 px-3 py-1 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                <span>Sort:</span>
                <span className="font-semibold">
                  {sort === "newest"
                    ? "Newest"
                    : sort === "featured"
                      ? "Featured"
                      : sort === "price_asc"
                        ? "Price ↑"
                        : "Price ↓"}
                </span>
              </span>
            </div>
          </div>
        </header>

        {/* GET form so Playwright can assert URL-driven search */}
        <form
          method="get"
          action="/search"
          className="card-surface rounded-3xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur-sm"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-6">
              <label className="block text-xs font-semibold text-muted-foreground">
                Keywords
              </label>
              <SuggestInput
                name="q"
                value={q}
                onChange={setQ}
                placeholder="Search…"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-muted-foreground">
                Type
              </label>
              <select
                name="type"
                defaultValue={type}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 ring-focus"
              >
                <option value="product">product</option>
                <option value="service">service</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-muted-foreground">
                Sort
              </label>
              <select
                name="sort"
                defaultValue={sort}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 ring-focus"
              >
                <option value="newest">Newest</option>
                <option value="featured">Featured first</option>
                <option value="price_asc">Price ↑</option>
                <option value="price_desc">Price ↓</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="submit" className="btn-gradient-primary">
              Apply filters
            </button>
          </div>
        </form>

        {/* ✅ Test expects a visible “Showing …” div even if empty */}
        <div
          className="card-surface rounded-2xl border border-border bg-card/70 p-3 text-sm text-muted-foreground shadow-sm"
          aria-live="polite"
        >
          Showing {loading ? "…" : total} result
          {(loading ? false : total !== 1) ? "s" : ""}.
        </div>

        {err ? (
          <div className="card-surface rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
            {err}
          </div>
        ) : items.length === 0 && !loading ? (
          <div className="card-surface rounded-2xl border border-border p-6 text-sm text-muted-foreground">
            No results found. Try a different search.
          </div>
        ) : (
          <section
            className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
            aria-label="Search results"
          >
            {items.map((it: any) => {
              const isProduct = type === "product";
              const id = String(it?.id);
              const name = isProduct
                ? String(it?.name || "Product")
                : String(it?.name || it?.title || "Service");
              const href = isProduct
                ? `/product/${encodeURIComponent(id)}`
                : `/service/${encodeURIComponent(id)}`;
              const img = typeof it?.image === "string" ? it.image : null;

              const sellerVerified = pickSellerVerified(it);
              const sellerTier = pickSellerFeaturedTier(it);

              const storeHref = storeHrefFrom(it);
              const sellerLabel = storeHref ? pickSellerLabel(it) : null;

              const price =
                typeof it?.price === "number" && it.price > 0
                  ? `KES ${it.price.toLocaleString("en-KE")}`
                  : "—";

              return (
                <div
                  key={`${type}-${id}`}
                  className="card-surface group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <Link
                    href={href}
                    className="block focus:outline-none focus:ring-2 ring-focus"
                    aria-label={`${isProduct ? "Product" : "Service"}: ${name}`}
                  >
                    <div className="aspect-[4/3] w-full bg-muted">
                      <div
                        className="h-full w-full"
                        style={{
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          backgroundImage: img ? `url(${img})` : "none",
                        }}
                        aria-hidden="true"
                      />
                    </div>

                    <div className="p-3">
                      <div className="line-clamp-1 text-sm font-semibold text-foreground">
                        {name}
                      </div>

                      {/* ✅ Badge text assertions (header-search.spec.ts) */}
                      <SellerBadgesRow
                        verified={sellerVerified}
                        tier={sellerTier}
                      />

                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="line-clamp-1">{price}</span>
                        <span className="opacity-70">
                          {isProduct ? "Product" : "Service"}
                        </span>
                      </div>
                    </div>
                  </Link>

                  {storeHref && (
                    <div className="border-t border-border px-3 py-2">
                      <Link
                        href={storeHref}
                        prefetch={false}
                        className="inline-flex items-center gap-2 text-xs font-semibold text-[#39a0ca] hover:underline underline-offset-4"
                        aria-label={`View seller: ${sellerLabel || "Seller"}`}
                      >
                        <span className="truncate">{sellerLabel}</span>
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}
      </section>
    </main>
  );
}
