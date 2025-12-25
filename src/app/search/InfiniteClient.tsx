"use client";
// src/app/search/InfiniteClient.tsx

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InfiniteLoader from "@/app/components/InfiniteLoader";
import VerifiedBadge from "@/app/components/VerifiedBadge";
import type { Sort } from "./SearchClient";

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

  const seller = raw?.seller ?? raw?.user ?? raw?.owner ?? null;
  const sellerObj =
    seller && typeof seller === "object" && !Array.isArray(seller) ? seller : null;

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

  const seller = raw?.seller ?? raw?.user ?? raw?.owner ?? null;

  const hasOwn = (o: any, k: string) =>
    !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);

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
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "-";
  return `KES ${n.toLocaleString("en-KE")}`;
}

/* ------------------------ Badges (single canonical component) ------------------------ */

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
        featured={false}
      />
    </div>
  );
}

/* ---------------------------- Component --------------------------- */

export function InfiniteClient({
  endpoint,
  initial,
  params,
  renderInitial = true,
}: Props) {
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
  const [totalPages, setTotalPages] = useState<number>(
    initial?.totalPages ?? 1,
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [done, setDone] = useState<boolean>(
    (initial?.page ?? 1) >= (initial?.totalPages ?? 1),
  );
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

      const data = (await res.json()) as
        | Envelope<ProductHit>
        | Envelope<ServiceHit>;

      // De-duplicate by id
      const fresh = (Array.isArray(data.items) ? data.items : []).filter(
        (it: any) => {
          const id = String(it?.id);
          if (idsRef.current.has(id)) return false;
          idsRef.current.add(id);
          return true;
        },
      );

      setPages((prev) => (fresh.length ? [...prev, fresh as any] : prev));
      setPage(typeof data.page === "number" ? data.page : nextPage);
      setTotalPages(
        typeof data.totalPages === "number" ? data.totalPages : totalPages,
      );
      if (
        (typeof data.page === "number" ? data.page : nextPage) >=
        (data.totalPages ?? totalPages)
      ) {
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
      typeof document !== "undefined"
        ? document.querySelector("[data-grid-sentinel]")
        : null;
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
              const href = `/product/${encodeURIComponent(String(p.id))}`;
              const hasPrice = typeof p.price === "number" && p.price > 0;

              const sellerVerified = pickSellerVerified(p as any);
              const sellerTier = pickSellerFeaturedTier(p as any);

              const storeHref = storeHrefFrom(p as any);
              const sellerLabel = storeHref ? pickSellerLabel(p as any) : null;

              return (
                <div
                  key={`p-${p.id}`}
                  className={[
                    "group h-full overflow-hidden rounded-2xl border shadow-soft transition",
                    "border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
                    "hover:border-[var(--border)] hover:bg-[var(--bg-subtle)]",
                  ].join(" ")}
                >
                  <Link
                    href={href}
                    prefetch={false}
                    aria-label={`Product: ${p.name}`}
                    className="block h-full focus-visible:outline-none focus-visible:ring-2 ring-focus"
                  >
                    <div className="relative h-36 w-full overflow-hidden bg-[var(--bg-subtle)] sm:h-44">
                      {p.image ? (
                        <img
                          src={p.image}
                          alt={p.name}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                          No photo
                        </div>
                      )}
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
                        <span>{hasPrice ? fmtKES(p.price) : "-"}</span>
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
            const href = `/service/${encodeURIComponent(String(s.id))}`;

            const hasPrice = typeof s.price === "number" && s.price > 0;
            const sellerVerified = pickSellerVerified(s as any);
            const sellerTier = pickSellerFeaturedTier(s as any);

            const storeHref = storeHrefFrom(s as any);
            const sellerLabel = storeHref ? pickSellerLabel(s as any) : null;

            return (
              <div
                key={`s-${s.id}`}
                className={[
                  "group h-full overflow-hidden rounded-2xl border shadow-soft transition",
                  "border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
                  "hover:border-[var(--border)] hover:bg-[var(--bg-subtle)]",
                ].join(" ")}
              >
                <Link
                  href={href}
                  prefetch={false}
                  aria-label={`Service: ${name}`}
                  className="block h-full focus-visible:outline-none focus-visible:ring-2 ring-focus"
                >
                  <div className="relative h-36 w-full overflow-hidden bg-[var(--bg-subtle)] sm:h-44">
                    {s.image ? (
                      <img
                        src={s.image}
                        alt={name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                        No photo
                      </div>
                    )}
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
                      <span>{hasPrice ? fmtKES(s.price) : "-"}</span>
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
        <InfiniteLoader
          onLoadAction={fetchNext}
          disabled={done || loading || !!error}
        />
      </div>
    </>
  );
}
