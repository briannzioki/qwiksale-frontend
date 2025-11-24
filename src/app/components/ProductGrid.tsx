"use client";
// src/app/components/ProductGrid.tsx

import Link from "next/link";
import SmartImage from "@/app/components/SmartImage";
import ProductCard from "@/app/components/ProductCard";
import { shimmer as shimmerMaybe } from "@/app/lib/blur";

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
  it: MixedItem;
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

  const alt = it.name
    ? `${it.type === "service" ? "Service" : "Product"} image for ${it.name}`
    : it.type === "service"
    ? "Service image"
    : "Product image";

  // Border-first card using semantic tokens
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className="group"
      aria-label={`${it.type === "service" ? "Service" : "Product"}: ${it.name ?? "Listing"}`}
      title={it.name ?? undefined}
    >
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card transition">
        {it.featured ? (
          <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white">
            Featured
          </span>
        ) : null}

        <div className="relative h-40 w-full bg-muted">
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
          <h3 className="line-clamp-1 font-semibold text-foreground">
            {it.name}
          </h3>
          <p className="mt-1 font-bold text-brandBlue">
            {fmtKES(it.price)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {it.type === "service" ? "Service" : "Product"}
          </p>
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
                position: idx,
                prefetch: prefetchCards,
              } as any)}
              // ProductCard already follows the border-first, lighter style after your recent updates
            />
          )
        )}

        {/* Skeletons while loading first page */}
        {items.length === 0 &&
          loading &&
          Array.from({ length: pageSize }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="rounded-2xl border border-border bg-card p-3"
            >
              <div className="h-40 w-full animate-pulse rounded-lg bg-muted" />
              <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="mt-1 h-4 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          ))}
      </div>

      {/* Status / errors / empty */}
      <div className="mt-4">
        {error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : !loading && items.length === 0 ? (
          <div className="text-sm text-muted-foreground">{emptyText}</div>
        ) : null}
      </div>

      {/* Load more button */}
      {showLoadMoreButton && hasMore && (
        <div className="mt-4 flex items-center justify-center">
          <button
            onClick={() => onLoadMoreAction && onLoadMoreAction()}
            disabled={loading}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-60"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {/* Optional sentinel for auto-load (parent controls when to fetch) */}
      {useSentinel && hasMore && !loading && (
        <div
          // Consumers can wrap this div with their own IntersectionObserver if needed
          data-grid-sentinel
          className="h-1 w-full"
        />
      )}
    </div>
  );
}
