"use client";
// src/app/components/ServiceGrid.tsx

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import IconButton from "@/app/components/IconButton";
import DeleteListingButton from "@/app/components/DeleteListingButton"; // ✅ canonical import
import VerifiedBadge from "@/app/components/VerifiedBadge";

type FeaturedTier = "basic" | "gold" | "diamond";
type SellerBadges = { verified: boolean | null; tier: FeaturedTier | null };

type ServiceItem = {
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
  if (isObj && "sellerBadges" in it && it.sellerBadges && typeof it.sellerBadges === "object") {
    const sb = it.sellerBadges as any;
    const verified = typeof sb?.verified === "boolean" ? (sb.verified as boolean) : null;
    const tier = normalizeTier(sb?.tier);
    return { verified, tier };
  }

  // 2) aliases
  if (isObj && ("sellerVerified" in it || "sellerFeaturedTier" in it)) {
    const verified =
      typeof it?.sellerVerified === "boolean" ? (it.sellerVerified as boolean) : null;
    const tier = normalizeTier(it?.sellerFeaturedTier);
    return { verified, tier };
  }

  // 3) legacy
  const verified = typeof it?.verified === "boolean" ? (it.verified as boolean) : null;
  const tier = normalizeTier(it?.featuredTier);
  return { verified, tier };
}

/** tiny shimmer dataURL for next/image blur placeholders (browser-only) */
function shimmer(width: number, height: number) {
  const svg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <defs>
      <linearGradient id="g">
        <stop stop-color="rgba(0,0,0,0.06)" offset="20%" />
        <stop stop-color="rgba(0,0,0,0.10)" offset="50%" />
        <stop stop-color="rgba(0,0,0,0.06)" offset="70%" />
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="rgba(0,0,0,0.06)" />
    <rect id="r" width="${width}" height="${height}" fill="url(#g)" />
    <animate xlink:href="#r" attributeName="x" from="-${width}" to="${width}" dur="1.2s" repeatCount="indefinite" />
  </svg>`.trim();

  // Avoid Node Buffer so TS doesn't require node types; this is a client component.
  const encode = (s: string) => {
    try {
      // encodeURIComponent handles unicode safely for btoa
      return typeof window !== "undefined" ? window.btoa(unescape(encodeURIComponent(s))) : "";
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
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
        {items.map((s) => {
          const blur = shimmer(800, 440);
          const categoryText =
            [s.category ?? "", s.subcategory ?? ""].filter(Boolean).join(" • ") || "-";

          // ✅ Normalize prefix to guarantee `/service/:id/edit` shape even if caller omits the trailing slash
          const prefixNormalized = editHrefPrefix.endsWith("/")
            ? editHrefPrefix
            : `${editHrefPrefix}/`;
          const editHref = `${prefixNormalized}${encodeURIComponent(s.id)}/edit`;

          const ariaTitle = s.name || "Service";

          const badges = resolveSellerBadges(s);
          const showBadges = typeof badges.verified === "boolean" || badges.tier !== null;

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
                className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 ring-focus"
                aria-label={`Service: ${ariaTitle}`}
                title={ariaTitle}
              >
                <div
                  className={[
                    "relative overflow-hidden rounded-2xl border bg-[var(--bg-elevated)] transition will-change-transform",
                    "border-[var(--border-subtle)] shadow-sm",
                    "group-hover:-translate-y-0.5 group-hover:border-[var(--border)] group-hover:shadow-soft",
                    "active:scale-[.99]",
                  ].join(" ")}
                >
                  <div className="relative">
                    <Image
                      alt={s.name || "Service image"}
                      src={s.image || FALLBACK_IMG}
                      width={800}
                      height={440}
                      className="h-36 w-full bg-[var(--bg-subtle)] object-cover sm:h-44"
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

                  <div className="p-2.5 sm:p-3 md:p-4">
                    <h3 className="line-clamp-1 text-sm font-semibold text-[var(--text)] sm:text-base">
                      {s.name || "Unnamed service"}
                    </h3>

                    <p className="line-clamp-1 text-[11px] text-[var(--text-muted)] sm:text-xs">
                      {categoryText}
                    </p>

                    <p className="mt-1 text-sm font-extrabold tracking-tight text-[var(--text)] sm:text-base">
                      {fmtKES(s.price)}
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
            </div>
          );
        })}

        {/* Skeletons while loading first page */}
        {items.length === 0 &&
          loading &&
          Array.from({ length: pageSize }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 shadow-sm sm:p-3"
            >
              <div className="h-36 w-full animate-pulse rounded-xl bg-[var(--bg-subtle)] sm:h-44" />
              <div className="mt-2 h-4 w-3/4 animate-pulse rounded-lg bg-[var(--bg-subtle)]" />
              <div className="mt-1 h-4 w-1/2 animate-pulse rounded-lg bg-[var(--bg-subtle)]" />
            </div>
          ))}
      </div>

      {/* Status / errors / empty */}
      <div className="mt-4">
        {error ? (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 text-sm text-[var(--text)] shadow-sm">
            {error}
          </div>
        ) : !loading && items.length === 0 ? (
          <div className="text-sm text-[var(--text-muted)]">{emptyText}</div>
        ) : null}
      </div>

      {/* Load more */}
      {showLoadMoreButton && hasMore && (
        <div className="mt-4 flex items-center justify-center">
          <button
            onClick={() => onLoadMoreAction && onLoadMoreAction()}
            disabled={loading}
            className={[
              "rounded-xl border px-4 py-2 text-xs font-semibold shadow-sm transition sm:text-sm",
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

      {/* Optional sentinel for auto-load (parent controls IO) */}
      {useSentinel && hasMore && !loading && <div data-grid-sentinel className="h-1 w-full" />}
    </div>
  );
}
