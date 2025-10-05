// src/app/components/ServiceGrid.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import DeleteListingButton from "@/app/components/DeleteListingButton";

type ServiceItem = {
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

type Props = {
  items: ServiceItem[];
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

  /** Dashboard mode: show Edit/Delete per item */
  ownerControls?: boolean;

  /**
   * Serialisable edit href prefix (instead of a function).
   * Final edit link is `${editHrefPrefix}${encodeURIComponent(id)}`.
   * Default: "/sell/service?id="
   */
  editHrefPrefix?: string;

  /**
   * Optional Server Action called after a delete completes.
   * If you pass this from a Server Component, define it with `"use server"`
   * and keep the name as *Action so Next will allow it.
   */
  onItemDeletedAction?: (id: string) => void | Promise<void>;
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

export default function ServiceGrid({
  items,
  loading = false,
  error = null,
  hasMore = false,
  onLoadMoreAction,
  pageSize = 24,
  prefetchCards = true,
  className = "",
  emptyText = "No services found. Try adjusting filters.",
  useSentinel = true,
  showLoadMoreButton = true,
  ownerControls = false,
  editHrefPrefix = "/sell/service?id=",
  onItemDeletedAction,
}: Props) {
  return (
    <div className={className}>
      {/* Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((s) => {
          const blur = shimmer(800, 440);
          const categoryText =
            [s.category ?? "", s.subcategory ?? ""].filter(Boolean).join(" • ") || "—";

          const editHref = `${editHrefPrefix}${encodeURIComponent(s.id)}`;

          return (
            <div key={s.id} className="group relative">
              {/* Card */}
              <Link href={`/service/${s.id}`} prefetch={prefetchCards} className="block">
                <div className="relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow transition hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
                  {s.featured ? (
                    <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white shadow">
                      Featured
                    </span>
                  ) : null}

                  {/* Owner actions overlay */}
                  {ownerControls && (
                    <div className="absolute right-2 top-2 z-20 flex items-center gap-2">
                      <Link
                        href={editHref}
                        className="rounded border bg-white/90 px-2 py-1 text-xs hover:bg-white dark:bg-gray-900"
                        onClick={(e) => e.stopPropagation()}
                        title="Edit service"
                        aria-label="Edit service"
                      >
                        Edit
                      </Link>

                      {/* Only pass afterDeleteAction when we actually have an action */}
                      <DeleteListingButton
                        serviceId={s.id}
                        label="Delete"
                        className="rounded bg-red-600/90 px-2 py-1 text-xs text-white hover:bg-red-600"
                        {...(onItemDeletedAction
                          ? { afterDeleteAction: () => onItemDeletedAction(s.id) }
                          : {})}
                      />
                    </div>
                  )}

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
            </div>
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
      <div className="mt-4">
        {error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : !loading && items.length === 0 ? (
          <div className="text-sm text-gray-600 dark:text-slate-300">{emptyText}</div>
        ) : null}
      </div>

      {/* Load more button (optional) */}
      {showLoadMoreButton && hasMore && (
        <div className="mt-4 flex items-center justify-center">
          <button
            onClick={() => onLoadMoreAction && onLoadMoreAction()}
            disabled={loading}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {/* Optional sentinel for auto-load (parent can observe this) */}
      {useSentinel && hasMore && !loading && <div data-grid-sentinel className="h-1 w-full" />}
    </div>
  );
}
