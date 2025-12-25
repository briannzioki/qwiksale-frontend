// src/app/search/SearchClient.tsx
"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import InfiniteLoader from "@/app/components/InfiniteLoader";
import VerifiedBadge from "@/app/components/VerifiedBadge";

/** 🔒 Unified sort enum for search across product/service */
export type Sort = "newest" | "featured" | "price_asc" | "price_desc";

/** Labels shown in the sort <select> (keep in sync with backend if needed) */
export const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "featured", label: "Featured first" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
] as const satisfies ReadonlyArray<{ value: Sort; label: string }>;

/* ------------------------------ Types ------------------------------ */

type FeaturedTier = "basic" | "gold" | "diamond";

type SellerBadges = {
  verified?: boolean | null;
  tier?: FeaturedTier | string | null;
};

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
  sellerBadges?: SellerBadges | null;

  seller?: {
    id?: string | null;
    username?: string | null;
    name?: string | null;
    image?: string | null;
    verified?: boolean | null;
    featuredTier?: FeaturedTier | string | null;
    emailVerified?: unknown;
    email_verified?: unknown;
    emailVerifiedAt?: unknown;
    email_verified_at?: unknown;
    verifiedAt?: unknown;
    verified_at?: unknown;
  } | null;

  emailVerified?: unknown;
  email_verified?: unknown;
  emailVerifiedAt?: unknown;
  email_verified_at?: unknown;
  verifiedAt?: unknown;
  verified_at?: unknown;
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
  sellerBadges?: SellerBadges | null;

  seller?: {
    id?: string | null;
    username?: string | null;
    name?: string | null;
    image?: string | null;
    verified?: boolean | null;
    featuredTier?: FeaturedTier | string | null;
    emailVerified?: unknown;
    email_verified?: unknown;
    emailVerifiedAt?: unknown;
    email_verified_at?: unknown;
    verifiedAt?: unknown;
    verified_at?: unknown;
  } | null;

  emailVerified?: unknown;
  email_verified?: unknown;
  emailVerifiedAt?: unknown;
  email_verified_at?: unknown;
  verifiedAt?: unknown;
  verified_at?: unknown;
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

function safeEncodeSegment(v: unknown): string {
  const s = typeof v === "string" ? v : v == null ? "" : String(v);
  return encodeURIComponent(s);
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

function normalizeStoreHandle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let s = raw.trim();
  if (!s) return "";
  try {
    s = decodeURIComponent(s);
  } catch {
    // ignore
  }
  s = s.trim().replace(/^@+/, "");
  return s;
}

function isStoreCodeToken(raw: unknown): boolean {
  const s = normalizeStoreHandle(raw);
  if (!s) return false;
  const lower = s.toLowerCase();
  if (lower === "undefined" || lower === "null" || lower === "nan") return false;
  if (/^(?:sto|store)[-_]?\d{1,18}$/i.test(s)) return true;
  if (/^\d{1,18}$/.test(s)) return true;
  return false;
}

function pickSellerVerified(raw: any): boolean | null {
  if (!raw || typeof raw !== "object") return null;

  const hasOwn = (o: any, k: string) =>
    !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);

  // ✅ 1) sellerBadges.verified is authoritative IF sellerBadges key exists (even if null)
  if (hasOwn(raw, "sellerBadges")) {
    const sb = raw.sellerBadges;
    if (sb && typeof sb === "object" && !Array.isArray(sb)) {
      if (hasOwn(sb, "verified")) {
        const v = (sb as any).verified;
        return typeof v === "boolean" ? v : null;
      }
      return null;
    }
    return null;
  }

  // ✅ 2) sellerVerified alias is authoritative IF key exists (even if null)
  if (hasOwn(raw, "sellerVerified")) {
    const v = (raw as any).sellerVerified;
    return typeof v === "boolean" ? v : null;
  }

  const seller = raw?.seller ?? raw?.user ?? raw?.owner ?? null;
  const sellerObj =
    seller && typeof seller === "object" && !Array.isArray(seller) ? seller : null;

  // Fallback: conservative emailVerified-like resolver (only when canonical fields are absent)
  const normalizeEmailVerified = (v: unknown): boolean | null => {
    if (v === null) return false;
    if (typeof v === "boolean") return v;

    if (v instanceof Date) {
      const t = v.getTime();
      return Number.isFinite(t) ? true : null;
    }

    if (typeof v === "number") {
      if (!Number.isFinite(v)) return null;
      return v > 0;
    }

    if (typeof v === "string") {
      const s = v.trim();
      if (!s) return false;

      const low = s.toLowerCase();
      if (low === "null" || low === "undefined") return false;

      const parsed = Date.parse(s);
      if (!Number.isNaN(parsed)) return true;

      if (/^\d+$/.test(s)) {
        const n = Number(s);
        if (Number.isFinite(n)) return n > 0;
      }

      return null;
    }

    return null;
  };

  const emailCandidates: Array<[any, string]> = [
    [raw, "emailVerified"],
    [raw, "email_verified"],
    [raw, "emailVerifiedAt"],
    [raw, "email_verified_at"],
    [raw, "verifiedAt"],
    [raw, "verified_at"],
    [sellerObj, "emailVerified"],
    [sellerObj, "email_verified"],
    [sellerObj, "emailVerifiedAt"],
    [sellerObj, "email_verified_at"],
    [sellerObj, "verifiedAt"],
    [sellerObj, "verified_at"],
  ];

  for (const [o, k] of emailCandidates) {
    if (!o || !hasOwn(o, k)) continue;
    const v = (o as any)[k];
    const norm = normalizeEmailVerified(v);
    if (typeof norm === "boolean") return norm;
  }

  return null;
}

function pickSellerFeaturedTier(raw: any): FeaturedTier | null {
  if (!raw || typeof raw !== "object") return null;

  const hasOwn = (o: any, k: string) =>
    !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);

  const seller = raw?.seller ?? raw?.user ?? raw?.owner ?? null;

  // ✅ 1) sellerBadges.tier is authoritative IF sellerBadges key exists (even if null)
  if (hasOwn(raw, "sellerBadges")) {
    const sb = raw.sellerBadges;
    if (sb && typeof sb === "object" && !Array.isArray(sb)) {
      if (hasOwn(sb, "tier")) return coerceFeaturedTier((sb as any).tier);
      return null;
    }
    return null;
  }

  // ✅ 2) sellerFeaturedTier alias is authoritative IF key exists (even if null)
  if (hasOwn(raw, "sellerFeaturedTier")) {
    return coerceFeaturedTier((raw as any).sellerFeaturedTier);
  }

  const candidates: unknown[] = [
    seller?.featuredTier,
    seller?.featured_tier,
    seller?.tier,
    seller?.featuredLevel,
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
      if (!s) continue;
      if (isStoreCodeToken(s)) continue;
      return s;
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
      if (!s) continue;
      if (isStoreCodeToken(s)) continue;
      return s;
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
  if (!slug) return null;
  const trimmed = slug.trim();
  if (!trimmed) return null;
  return `/store/${safeEncodeSegment(trimmed)}`;
}

/* ------------------------ Seller badge UI (single canonical component) ------------------------ */

function SellerBadgesRow({
  verified,
  tier,
}: {
  verified?: boolean | null;
  tier?: FeaturedTier | null;
}) {
  const hasVerified = typeof verified === "boolean";
  const hasTier = tier === "basic" || tier === "gold" || tier === "diamond";
  if (!hasVerified && !hasTier) return null;

  return (
    <div className="mt-1.5 sm:mt-2">
      <VerifiedBadge
        {...(hasVerified ? { verified } : {})}
        {...(hasTier ? { featuredTier: tier } : {})}
        // Never derive tier from `featured` boolean in this UI.
        featured={false}
      />
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

/* ---------------------------- InfiniteClient (kept intact) ---------------------------- */

function InfiniteClient({ endpoint, initial, params }: Props) {
  const isProduct = params.type === "product";

  const idsRef = useRef<Set<string>>(new Set(initial.items.map((i: any) => String(i.id))));

  const [pages, setPages] = useState<Array<ProductHit[] | ServiceHit[]>>([
    initial.items as any,
  ]);
  const [page, setPage] = useState<number>(initial.page);
  const [totalPages, setTotalPages] = useState<number>(initial.totalPages);
  const [loading, setLoading] = useState<boolean>(false);
  const [done, setDone] = useState<boolean>(initial.page >= initial.totalPages);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(() => pages.flat(), [pages]);

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

      const data = coerceEnvelope<ProductHit | ServiceHit>(
        await res.json().catch(() => ({})),
      );

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

  const cardClass = [
    "group overflow-hidden rounded-2xl border shadow-soft transition",
    "border-[var(--border-subtle)]",
    "bg-[var(--bg-elevated)]",
    "hover:-translate-y-0.5 hover:bg-[var(--bg-subtle)]",
  ].join(" ");

  const linkClass = [
    "block",
    "focus-visible:outline-none focus-visible:ring-2 ring-focus",
    "active:scale-[.99]",
  ].join(" ");

  return (
    <>
      {items.length > 0 && (
        <div
          className={[
            "mt-3 grid gap-3",
            "grid-cols-1 min-[420px]:grid-cols-2",
            "sm:mt-4 sm:gap-4",
            "md:grid-cols-3 md:gap-6",
            "xl:grid-cols-4",
          ].join(" ")}
        >
          {items.map((it: any) => {
            if (isProduct) {
              const p = it as ProductHit;
              const href = `/product/${safeEncodeSegment(p.id)}`;

              const sellerVerified = pickSellerVerified(p as any);
              const sellerTier = pickSellerFeaturedTier(p as any);

              const storeHref = storeHrefFrom(p as any);
              const sellerLabel = storeHref ? pickSellerLabel(p as any) : null;

              return (
                <div key={p.id} className={cardClass}>
                  <Link
                    href={href}
                    aria-label={`Product: ${p.name}`}
                    className={linkClass}
                  >
                    <div className="h-36 w-full bg-[var(--bg-subtle)] sm:h-44">
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

                    <div className="p-2.5 sm:p-3">
                      <div className="line-clamp-1 text-sm font-semibold text-[var(--text)]">
                        {p.name}
                      </div>

                      <SellerBadgesRow verified={sellerVerified} tier={sellerTier} />

                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--text-muted)] sm:mt-2 sm:text-xs">
                        <span className="line-clamp-1">
                          {p.category || p.subcategory || "-"}
                        </span>
                        <span>
                          {typeof p.price === "number" && p.price > 0
                            ? `KES ${p.price.toLocaleString("en-KE")}`
                            : "-"}
                        </span>
                      </div>
                    </div>
                  </Link>

                  {storeHref && (
                    <div className="border-t border-[var(--border-subtle)] px-2.5 py-2 sm:px-3">
                      <Link
                        href={storeHref}
                        prefetch={false}
                        className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text)] hover:underline underline-offset-4"
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
            const href = `/service/${safeEncodeSegment(s.id)}`;

            const sellerVerified = pickSellerVerified(s as any);
            const sellerTier = pickSellerFeaturedTier(s as any);

            const storeHref = storeHrefFrom(s as any);
            const sellerLabel = storeHref ? pickSellerLabel(s as any) : null;

            return (
              <div key={s.id} className={cardClass}>
                <Link
                  href={href}
                  aria-label={`Service: ${name}`}
                  className={linkClass}
                >
                  <div className="h-36 w-full bg-[var(--bg-subtle)] sm:h-44">
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

                  <div className="p-2.5 sm:p-3">
                    <div className="line-clamp-1 text-sm font-semibold text-[var(--text)]">
                      {name}
                    </div>

                    <SellerBadgesRow verified={sellerVerified} tier={sellerTier} />

                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--text-muted)] sm:mt-2 sm:text-xs">
                      <span className="line-clamp-1">
                        {s.serviceArea || s.availability || "-"}
                      </span>
                      <span>
                        {typeof s.price === "number" && s.price > 0
                          ? `KES ${s.price.toLocaleString("en-KE")}`
                          : "-"}
                      </span>
                    </div>
                  </div>
                </Link>

                {storeHref && (
                  <div className="border-t border-[var(--border-subtle)] px-2.5 py-2 sm:px-3">
                    <Link
                      href={storeHref}
                      prefetch={false}
                      className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text)] hover:underline underline-offset-4"
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
          className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text)] shadow-soft"
        >
          <span>{error}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text)] shadow-sm hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 ring-focus active:scale-[.99]"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div ref={sentinelRef} className="mt-3 sm:mt-4">
        <InfiniteLoader onLoadAction={fetchNext} disabled={done || loading || !!error} />
      </div>
    </>
  );
}

void InfiniteClient;

/* ---------------------------- SearchCombobox (listbox-safe) --------------------------- */

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function SearchCombobox({
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const blurTimerRef = useRef<number | null>(null);

  const debounced = useDebouncedValue(value, 250);

  const trimmed = (value || "").trim();
  const debouncedTrimmed = (debounced || "").trim();

  const suggestions = useMemo(() => {
    if (!debouncedTrimmed) return [];
    if (debouncedTrimmed.length < 2) return [];
    return Array.from(
      new Set([debouncedTrimmed, `${debouncedTrimmed} near me`, `${debouncedTrimmed} kenya`]),
    ).slice(0, 6);
  }, [debouncedTrimmed]);

  const hasSuggestions = suggestions.length > 0;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const expanded = open && trimmed.length > 0;

  useEffect(() => {
    if (!trimmed) {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    setOpen(true);
  }, [trimmed]);

  useEffect(() => {
    if (!expanded || !hasSuggestions) {
      setActiveIndex(-1);
      return;
    }
    if (activeIndex >= suggestions.length) setActiveIndex(0);
  }, [expanded, hasSuggestions, activeIndex, suggestions.length]);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const commit = useCallback(
    (next: string) => {
      onChange(next);
      close();
      window.requestAnimationFrame(() => inputRef.current?.focus());
    },
    [onChange, close],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!expanded) {
        if ((e.key === "ArrowDown" || e.key === "ArrowUp") && trimmed.length > 0) {
          setOpen(true);
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }

      if (!hasSuggestions) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => {
          const next = i < 0 ? 0 : Math.min(suggestions.length - 1, i + 1);
          return next;
        });
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        return;
      }

      if (e.key === "Enter") {
        const chosen = suggestions[activeIndex];
        if (typeof chosen === "string") {
          e.preventDefault();
          commit(chosen);
        }
      }
    },
    [expanded, trimmed.length, hasSuggestions, suggestions, activeIndex, close, commit],
  );

  const onBlur = useCallback(() => {
    if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current);
    blurTimerRef.current = window.setTimeout(() => {
      close();
      blurTimerRef.current = null;
    }, 100);
  }, [close]);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current);
    };
  }, []);

  const activeOptionId =
    expanded && hasSuggestions && activeIndex >= 0
      ? `${listboxId}-opt-${activeIndex}`
      : undefined;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (trimmed) setOpen(true);
        }}
        onBlur={onBlur}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded ? "true" : "false"}
        aria-controls={expanded ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        className={[
          "mt-1 w-full rounded-xl px-3 py-2 text-sm",
          "bg-[var(--bg-elevated)] text-[var(--text)] placeholder:text-[var(--text-muted)]",
          "border border-[var(--border)] shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2 ring-focus",
        ].join(" ")}
      />

      {expanded && (
        <ul
          id={listboxId}
          role="listbox"
          className={[
            "absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-auto rounded-xl p-1 shadow-soft",
            "border border-[var(--border-subtle)]",
            "bg-[var(--bg-elevated)]",
          ].join(" ")}
        >
          {!hasSuggestions && (
            <li className="px-2 py-2 text-sm text-[var(--text-muted)]">
              No suggestions
            </li>
          )}

          {suggestions.map((s, idx) => {
            const isActive = idx === activeIndex;
            return (
              <li
                key={s}
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={isActive ? "true" : "false"}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(s)}
                className={[
                  "cursor-default rounded-lg px-2 py-1.5 text-sm text-[var(--text)]",
                  isActive ? "bg-[var(--bg-subtle)]" : "hover:bg-[var(--bg-subtle)]",
                ].join(" ")}
              >
                {s}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------- The actual /search UI --------------------------- */

const FIRST_PAGE_TIMEOUT_MS = 4000;

function SearchPageInternal() {
  const sp = useSearchParams();

  const type: "product" | "service" =
    (sp.get("type") || "").toLowerCase() === "service" ? "service" : "product";

  const sort = safeSort(sp.get("sort"));
  const qFromUrl = sp.get("q") || "";

  const [q, setQ] = useState(qFromUrl);

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
      minPrice: Number.isFinite(minPrice as number) ? (minPrice as number) : undefined,
      maxPrice: Number.isFinite(maxPrice as number) ? (maxPrice as number) : undefined,
      sort,
      page: 1,
      pageSize: 24,
    };
  }, [sp, qFromUrl, sort, type]);

  const [data, setData] = useState<Envelope<ProductHit | ServiceHit> | null>(null);
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
        if (!res.ok) throw new Error(json?.error || `Failed to load (${res.status})`);

        const env = coerceEnvelope<ProductHit | ServiceHit>(json);
        setData(env);
      } catch (e: any) {
        if (e?.name !== "AbortError") setErr(e?.message || "Failed to load search results");
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
    qFromUrl && qFromUrl.trim() ? `${heading}: “${qFromUrl.trim()}”` : heading;

  const fieldClass = [
    "mt-1 w-full rounded-xl px-3 py-2 text-sm",
    "bg-[var(--bg-elevated)] text-[var(--text)]",
    "border border-[var(--border)] shadow-sm",
    "focus-visible:outline-none focus-visible:ring-2 ring-focus",
  ].join(" ");

  return (
    <main id="main" className="container-page py-4 sm:py-6 text-[var(--text)]">
      <section className="mx-auto max-w-6xl space-y-3 sm:space-y-4">
        <header
          className={[
            "relative overflow-hidden rounded-2xl border shadow-soft",
            "border-[var(--border-subtle)]",
            "text-white",
            "bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca]",
          ].join(" ")}
          aria-label="Search header"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-60 mix-blend-soft-light"
            aria-hidden="true"
          >
            <div className="h-full w-full bg-[var(--bg)] opacity-10" />
          </div>

          <div className="px-4 py-5 text-white sm:px-6 sm:py-8">
            <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl md:text-3xl">
              {heroTitle}
            </h1>
            <p className="mt-1 text-xs text-white/80 sm:text-sm">
              Find products and services fast - filters update the URL.
            </p>

            <div
              className={[
                "mt-3 flex gap-2 overflow-x-auto pb-1 text-[11px] text-white/80",
                "[-webkit-overflow-scrolling:touch]",
                "sm:mt-4 sm:flex-wrap sm:overflow-visible sm:pb-0 sm:text-xs",
              ].join(" ")}
            >
              <span className="shrink-0 inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[var(--text)] shadow-sm backdrop-blur-sm sm:px-3">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--text)] opacity-70" />
                <span>Type:</span>
                <span className="font-semibold uppercase">{type}</span>
              </span>
              <span className="shrink-0 inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[var(--text)] shadow-sm backdrop-blur-sm sm:px-3">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--text)] opacity-60" />
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

        <form
          method="get"
          action="/search"
          className={[
            "rounded-2xl border p-3 shadow-soft sm:p-4",
            "border-[var(--border-subtle)]",
            "bg-[var(--bg-elevated)]",
          ].join(" ")}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-6">
              <label className="block text-[11px] font-semibold text-[var(--text-muted)] sm:text-xs">
                Keywords
              </label>
              <SearchCombobox name="q" value={q} onChange={setQ} placeholder="Search…" />
            </div>

            <div className="md:col-span-3">
              <label className="block text-[11px] font-semibold text-[var(--text-muted)] sm:text-xs">
                Type
              </label>
              <select name="type" defaultValue={type} className={fieldClass}>
                <option value="product">product</option>
                <option value="service">service</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block text-[11px] font-semibold text-[var(--text-muted)] sm:text-xs">
                Sort
              </label>
              <select name="sort" defaultValue={sort} className={fieldClass}>
                <option value="newest">Newest</option>
                <option value="featured">Featured first</option>
                <option value="price_asc">Price ↑</option>
                <option value="price_desc">Price ↓</option>
              </select>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2 sm:mt-4">
            <button type="submit" className="btn-gradient-primary w-full sm:w-auto">
              Apply filters
            </button>
          </div>
        </form>

        <div
          className={[
            "rounded-2xl border p-2.5 text-xs shadow-soft sm:p-3 sm:text-sm",
            "border-[var(--border-subtle)]",
            "bg-[var(--bg-elevated)]",
            "text-[var(--text-muted)]",
          ].join(" ")}
          aria-live="polite"
        >
          Showing {loading ? "…" : total} result{loading ? "" : total === 1 ? "" : "s"}.
        </div>

        {err ? (
          <div
            className={[
              "rounded-2xl border p-3 text-sm shadow-soft sm:p-4",
              "border-[var(--border)]",
              "bg-[var(--bg-subtle)]",
              "text-[var(--text)]",
            ].join(" ")}
          >
            {err}
          </div>
        ) : items.length === 0 && !loading ? (
          <div
            className={[
              "rounded-2xl border p-4 text-sm shadow-soft sm:p-6",
              "border-[var(--border-subtle)]",
              "bg-[var(--bg-elevated)]",
              "text-[var(--text-muted)]",
            ].join(" ")}
          >
            No results found. Try a different search.
          </div>
        ) : (
          <section
            className={[
              "grid gap-3",
              "grid-cols-1 min-[420px]:grid-cols-2",
              "sm:gap-4",
              "md:grid-cols-3 md:gap-6",
              "xl:grid-cols-4",
            ].join(" ")}
            aria-label="Search results"
          >
            {items.map((it: any) => {
              const isProduct = type === "product";
              const id = String(it?.id ?? "");
              const name = isProduct
                ? String(it?.name || "Product")
                : String(it?.name || it?.title || "Service");

              const href = isProduct
                ? `/product/${safeEncodeSegment(id)}`
                : `/service/${safeEncodeSegment(id)}`;

              const img = typeof it?.image === "string" ? it.image : null;

              const sellerVerified = pickSellerVerified(it);
              const sellerTier = pickSellerFeaturedTier(it);

              const storeHref = storeHrefFrom(it);
              const sellerLabel = storeHref ? pickSellerLabel(it) : null;

              const price =
                typeof it?.price === "number" && it.price > 0
                  ? `KES ${it.price.toLocaleString("en-KE")}`
                  : "-";

              return (
                <div
                  key={`${type}-${id}`}
                  className={[
                    "group overflow-hidden rounded-2xl border shadow-soft transition",
                    "border-[var(--border-subtle)]",
                    "bg-[var(--bg-elevated)]",
                    "hover:-translate-y-0.5 hover:bg-[var(--bg-subtle)]",
                  ].join(" ")}
                >
                  <Link
                    href={href}
                    className="block focus-visible:outline-none focus-visible:ring-2 ring-focus active:scale-[.99]"
                    aria-label={`${isProduct ? "Product" : "Service"}: ${name}`}
                  >
                    <div className="h-36 w-full bg-[var(--bg-subtle)] sm:h-44">
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

                    <div className="p-2.5 sm:p-3">
                      <div className="line-clamp-1 text-sm font-semibold text-[var(--text)]">
                        {name}
                      </div>

                      <SellerBadgesRow verified={sellerVerified} tier={sellerTier} />

                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--text-muted)] sm:mt-2 sm:text-xs">
                        <span className="line-clamp-1">{price}</span>
                        <span className="opacity-80">
                          {isProduct ? "Product" : "Service"}
                        </span>
                      </div>
                    </div>
                  </Link>

                  {storeHref && (
                    <div className="border-t border-[var(--border-subtle)] px-2.5 py-2 sm:px-3">
                      <Link
                        href={storeHref}
                        prefetch={false}
                        className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text)] hover:underline underline-offset-4"
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

export default function SearchClient({ children }: { children?: ReactNode }) {
  if (children) return <>{children}</>;
  return <SearchPageInternal />;
}
