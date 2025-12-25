"use client";
// src/app/components/ProductGrid.tsx

import Link from "next/link";
import SmartImage from "@/app/components/SmartImage";
import ProductCard from "@/app/components/ProductCard";
import { shimmer as shimmerMaybe } from "@/app/lib/blur";
import VerifiedBadge from "@/app/components/VerifiedBadge";

/* --------------------------------- types --------------------------------- */

type Mode = "products" | "all";

type FeaturedTier = "basic" | "gold" | "diamond";

type SellerBadges = { verified: boolean | null; tier: FeaturedTier | null };

type BaseItem = {
  id: string;
  name: string;
  price: number | null;
  image: string | null;
  featured?: boolean | null;

  /**
   * Canonical / preferred:
   * - API should send sellerBadges always
   * - optionally aliases: sellerVerified + sellerFeaturedTier
   */
  sellerBadges?: SellerBadges | null;
  sellerVerified?: boolean | null;
  sellerFeaturedTier?: FeaturedTier | string | null;

  /** Back-compat legacy inputs (fallback only): */
  verified?: boolean | null;
  featuredTier?: FeaturedTier | string | null;

  createdAt?: string;
};

type ProductItem = BaseItem;
type MixedItem = BaseItem & { type: "product" | "service" };

type Props =
  | {
      mode?: "products";
      items: ProductItem[];
      loading?: boolean;
      error?: string | null;
      hasMore?: boolean;
      onLoadMoreAction?: () => void | Promise<void>;
      pageSize?: number;
      prefetchCards?: boolean;
      className?: string;
      emptyText?: string;
      useSentinel?: boolean;
      showLoadMoreButton?: boolean;
    }
  | {
      mode: "all";
      items: MixedItem[];
      loading?: boolean;
      error?: string | null;
      hasMore?: boolean;
      onLoadMoreAction?: () => void | Promise<void>;
      pageSize?: number;
      prefetchCards?: boolean;
      className?: string;
      emptyText?: string;
      useSentinel?: boolean;
      showLoadMoreButton?: boolean;
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

function fmtKES(n: number | null | undefined) {
  if (typeof n !== "number" || n <= 0) return "Contact for price";
  try {
    return `KES ${new Intl.NumberFormat("en-KE", {
      maximumFractionDigits: 0,
    }).format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

function normalizeTier(v: unknown): FeaturedTier | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  if (t === "basic" || t === "gold" || t === "diamond") return t;
  return null;
}

/**
 * Canonical badge resolver (UI must not derive tier from `featured` boolean):
 * 1) sellerBadges if present
 * 2) sellerVerified + sellerFeaturedTier aliases
 * 3) legacy verified + featuredTier
 */
function resolveSellerBadges(it: any): SellerBadges {
  const isObj = it && typeof it === "object" && !Array.isArray(it);

  // 1) sellerBadges (preferred)
  if (
    isObj &&
    "sellerBadges" in it &&
    it.sellerBadges &&
    typeof it.sellerBadges === "object"
  ) {
    const sb = it.sellerBadges as any;
    const verified =
      typeof sb?.verified === "boolean" ? (sb.verified as boolean) : null;
    const tier = normalizeTier(sb?.tier);
    return { verified, tier };
  }

  // 2) aliases
  if (isObj && ("sellerVerified" in it || "sellerFeaturedTier" in it)) {
    const verified =
      typeof it?.sellerVerified === "boolean"
        ? (it.sellerVerified as boolean)
        : null;
    const tier = normalizeTier(it?.sellerFeaturedTier);
    return { verified, tier };
  }

  // 3) legacy
  const verified = typeof it?.verified === "boolean" ? (it.verified as boolean) : null;
  const tier = normalizeTier(it?.featuredTier);
  return { verified, tier };
}

/* -------------------------- simple mixed item tile ------------------------- */

function MixedTile({
  it,
  index,
  prefetch,
}: {
  it: MixedItem;
  index: number;
  prefetch: boolean;
}) {
  const href = it.type === "service" ? `/service/${it.id}` : `/product/${it.id}`;
  const url = it.image || PLACEHOLDER;

  const priority = index < 8;
  const blurProps = priority
    ? ({ placeholder: "blur", blurDataURL: getBlurDataURL(640, 360) } as const)
    : ({ placeholder: "empty" } as const);

  const alt = it.name
    ? `${it.type === "service" ? "Service" : "Product"} image for ${it.name}`
    : it.type === "service"
      ? "Service image"
      : "Product image";

  const badges = resolveSellerBadges(it);
  const showBadges = typeof badges.verified === "boolean" || badges.tier !== null;

  // Border-first card using semantic tokens
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 ring-focus"
      aria-label={`${it.type === "service" ? "Service" : "Product"}: ${it.name ?? "Listing"}`}
      title={it.name ?? undefined}
    >
      <div
        className={[
          "relative overflow-hidden rounded-2xl border bg-[var(--bg-elevated)] transition will-change-transform",
          "border-[var(--border-subtle)] shadow-sm",
          "group-hover:-translate-y-0.5 group-hover:border-[var(--border)] group-hover:shadow-soft",
          "active:scale-[.99]",
        ].join(" ")}
      >
        <div
          className={[
            "relative w-full bg-[var(--bg-subtle)]",
            "h-36 min-[420px]:h-40 sm:h-44",
          ].join(" ")}
        >
          <SmartImage
            src={url}
            alt={alt}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            priority={priority}
            {...blurProps}
          />
        </div>

        <div className="p-2.5 sm:p-3">
          <h3 className="line-clamp-1 text-sm sm:text-base font-semibold text-[var(--text)]">
            {it.name}
          </h3>

          <p className="mt-1 text-sm sm:text-base font-extrabold tracking-tight text-[var(--text)]">
            {fmtKES(it.price)}
          </p>

          <p className="mt-0.5 text-[11px] sm:text-xs text-[var(--text-muted)]">
            {it.type === "service" ? "Service" : "Product"}
          </p>

          {/* Exactly one badge component in this region (no separate tier overlays). */}
          {showBadges && (
            <div className="mt-2">
              <VerifiedBadge
                {...(typeof badges.verified === "boolean" ? { verified: badges.verified } : {})}
                featuredTier={badges.tier}
              />
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ---------------------------------- cmp ---------------------------------- */

export default function ProductGrid(props: Props) {
  const {
    mode = "products",
    items,
    loading = false,
    error = null,
    hasMore = false,
    onLoadMoreAction,
    pageSize = 24,
    prefetchCards = true,
    className = "",
    emptyText = "No items found. Try adjusting filters.",
    useSentinel = true,
    showLoadMoreButton = true,
  } = props as any;

  const isAll: boolean = mode === "all";

  return (
    <div className={className}>
      {/* Grid */}
      <div
        className={[
          "grid grid-cols-1 min-[420px]:grid-cols-2",
          "gap-3 sm:gap-4 md:gap-6",
          "sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4",
        ].join(" ")}
      >
        {items.map((p: any, idx: number) =>
          isAll ? (
            <MixedTile
              key={`${(p as MixedItem).type}-${p.id}`}
              it={p as MixedItem}
              index={idx}
              prefetch={prefetchCards}
            />
          ) : (
            <ProductCard
              key={p.id}
              {...({
                id: p.id,
                name: p.name,
                price: p.price ?? null,
                image: p.image ?? null,
                featured: Boolean(p.featured),

                // ✅ preferred canonical badge object (no tier derived from `featured`)
                sellerBadges: resolveSellerBadges(p),

                position: idx,
                prefetch: prefetchCards,
              } as any)}
            />
          ),
        )}

        {/* Skeletons while loading first page */}
        {items.length === 0 &&
          loading &&
          Array.from({ length: pageSize }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 sm:p-3 shadow-sm"
            >
              <div className="h-36 sm:h-44 w-full animate-pulse rounded-xl bg-[var(--bg-subtle)]" />
              <div className="mt-2 h-3 w-3/4 animate-pulse rounded-lg bg-[var(--bg-subtle)]" />
              <div className="mt-1 h-3 w-1/2 animate-pulse rounded-lg bg-[var(--bg-subtle)]" />
            </div>
          ))}
      </div>

      {/* Status / errors / empty */}
      <div className="mt-3 sm:mt-4">
        {error ? (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-2.5 sm:p-3 text-xs sm:text-sm text-[var(--text)] shadow-sm">
            {error}
          </div>
        ) : !loading && items.length === 0 ? (
          <div className="text-xs sm:text-sm text-[var(--text-muted)]">
            {emptyText}
          </div>
        ) : null}
      </div>

      {/* Load more button */}
      {showLoadMoreButton && hasMore && (
        <div className="mt-3 sm:mt-4 flex items-center justify-center">
          <button
            onClick={() => onLoadMoreAction && onLoadMoreAction()}
            disabled={loading}
            className={[
              "h-10 rounded-xl border px-4 text-xs sm:text-sm font-semibold shadow-sm transition",
              "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)]",
              "hover:bg-[var(--bg-subtle)] hover:border-[var(--border)]",
              "active:scale-[.99] disabled:opacity-60",
              "focus-visible:outline-none focus-visible:ring-2 ring-focus",
            ].join(" ")}
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {/* Optional sentinel for auto-load (parent controls when to fetch) */}
      {useSentinel && hasMore && !loading && (
        <div data-grid-sentinel className="h-1 w-full" />
      )}
    </div>
  );
}
