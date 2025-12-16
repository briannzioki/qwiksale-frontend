"use client";
// src/app/components/ServiceGrid.tsx

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import IconButton from "@/app/components/IconButton";
import DeleteListingButton from "@/app/components/DeleteListingButton"; // ✅ canonical import
import VerifiedBadge from "@/app/components/VerifiedBadge";

type ServiceItem = {
  id: string;
  name: string;
  price: number | null;
  image: string | null;
  featured?: boolean | null;

  /** Seller/account flags for public UI (optional) */
  verified?: boolean | null;
  featuredTier?: "basic" | "gold" | "diamond" | string | null;

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
   * Edit href prefix; the final link will be `${prefix}${id}/edit`.
   * Default: "/service/"
   */
  editHrefPrefix?: string;

  /** Optional callback after an item is deleted */
  onItemDeletedAction?: (id: string) => void | Promise<void>;
};

const FALLBACK_IMG = "/placeholder/default.jpg";

const fmtKES = (n?: number | null) =>
  typeof n === "number" && n > 0
    ? `KES ${new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(n)}`
    : "Contact for price";

/** tiny shimmer dataURL for next/image blur placeholders (browser-only) */
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
  </svg>`.trim();

  // Avoid Node Buffer so TS doesn't require node types; this is a client component.
  const encode = (s: string) => {
    try {
      // encodeURIComponent handles unicode safely for btoa
      return typeof window !== "undefined"
        ? window.btoa(unescape(encodeURIComponent(s)))
        : ""; // SSR path not used for "use client" component
    } catch {
      return "";
    }
  };

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
  editHrefPrefix = "/service/",
  onItemDeletedAction,
}: Props) {
  const router = useRouter();

  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((s) => {
          const blur = shimmer(800, 440);
          const categoryText =
            [s.category ?? "", s.subcategory ?? ""].filter(Boolean).join(" • ") || "—";

          // ✅ Normalize prefix to guarantee `/service/:id/edit` shape even if caller omits the trailing slash
          const prefixNormalized = editHrefPrefix.endsWith("/")
            ? editHrefPrefix
            : `${editHrefPrefix}/`;
          const editHref = `${prefixNormalized}${encodeURIComponent(s.id)}/edit`;

          const ariaTitle = s.name || "Service";

          const tier = (() => {
            if (typeof s.featuredTier === "string") {
              const t = s.featuredTier.trim().toLowerCase();
              if (t === "basic" || t === "gold" || t === "diamond") return t;
            }
            return s.featured ? "basic" : null;
          })();

          return (
            <div key={s.id} className="group relative">
              {/* Owner overlay controls — positioned OUTSIDE the link to avoid accidental navigation */}
              {ownerControls && (
                <div className="absolute right-2 top-2 z-20 flex items-center gap-2">
                  {/* EDIT */}
                  <IconButton
                    icon="edit"
                    variant="outline"
                    size="xs"
                    labelText={<span className="hidden sm:inline">Edit</span>}
                    srLabel="Edit service"
                    onClick={(e) => {
                      const me = e.nativeEvent as MouseEvent;
                      if (me.metaKey || me.ctrlKey) {
                        window.open(editHref, "_blank", "noopener,noreferrer");
                      } else {
                        router.push(editHref);
                      }
                    }}
                  />

                  {/* DELETE — DeleteListingButton renders IconButton internally */}
                  <DeleteListingButton
                    serviceId={s.id}
                    buttonVariant="outline"
                    buttonTone="danger"
                    buttonSize="xs"
                    {...(onItemDeletedAction
                      ? { onDeletedAction: () => onItemDeletedAction(s.id) }
                      : {})}
                  />
                </div>
              )}

              <Link
                href={`/service/${s.id}`}
                prefetch={prefetchCards}
                className="block"
                aria-label={`Service: ${ariaTitle}`}
                title={ariaTitle}
              >
                <div className="relative overflow-hidden rounded-2xl border border-border bg-card transition">
                  {s.featured ? (
                    <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748] px-2 py-1 text-xs text-white">
                      Featured
                    </span>
                  ) : null}

                  <div className="relative">
                    <Image
                      alt={s.name || "Service image"}
                      src={s.image || FALLBACK_IMG}
                      width={800}
                      height={440}
                      className="h-44 w-full bg-muted object-cover"
                      placeholder="blur"
                      blurDataURL={blur}
                      priority={false}
                      // Keep SVGs unoptimized so Next/Image doesn’t proxy them
                      unoptimized={Boolean((s.image as string | null)?.endsWith?.(".svg"))}
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        if (img && img.src !== FALLBACK_IMG) img.src = FALLBACK_IMG;
                      }}
                      loading="lazy"
                    />
                  </div>

                  <div className="p-4">
                    <h3 className="line-clamp-1 font-semibold text-foreground">
                      {s.name || "Unnamed service"}
                    </h3>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {categoryText}
                    </p>
                    <p className="mt-1 font-bold text-brandBlue">
                      {fmtKES(s.price)}
                    </p>

                    {(typeof s.verified === "boolean" || tier) && (
                      <div className="mt-2">
                        <VerifiedBadge
                          verified={typeof s.verified === "boolean" ? s.verified : null}
                          featured={Boolean(s.featured)}
                          featuredTier={tier}
                        />
                      </div>
                    )}
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

      {/* Load more */}
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

      {/* Optional sentinel for auto-load (parent controls IO) */}
      {useSentinel && hasMore && !loading && <div data-grid-sentinel className="h-1 w-full" />}
    </div>
  );
}
