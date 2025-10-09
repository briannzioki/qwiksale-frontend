// src/app/components/ProductCard.tsx
"use client";

import React, { memo, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SmartImage from "@/app/components/SmartImage";
import { shimmer as shimmerMaybe } from "@/app/lib/blur";
// ⬇️ Use a RELATIVE import to avoid resolving a page component by mistake
import DeleteListingButton from "./DeleteListingButton";

type Props = {
  id: string;
  name: string;
  price?: number | null;
  image?: string | null;
  featured?: boolean;
  /** Optional small meta text, e.g. "Electronics • Phones & Tablets" */
  subtitle?: string | null;
  /** 0-based position in the feed, used for analytics + image priority */
  position?: number;
  /** Allow route prefetching (default true) */
  prefetch?: boolean;
  className?: string;

  /** Dashboard mode: show Edit/Delete controls */
  ownerControls?: boolean;
  /** Optional custom edit href (fallback shown below) */
  editHref?: string;
  /** Called after a successful delete (e.g., remove from list) */
  onDeletedAction?: () => void;
};

/* ----------------------- Utils ----------------------- */

function formatKES(value?: number | null) {
  if (!value || value <= 0) return "Contact for price";
  try {
    return `KES ${new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(value)}`;
  } catch {
    return `KES ${Number(value).toLocaleString("en-KE")}`;
  }
}

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

/* ----------------------- Analytics ----------------------- */

function trackClient(event: string, payload?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.log("[qs:track]", event, payload);
  if (typeof window !== "undefined" && "CustomEvent" in window) {
    window.dispatchEvent(new CustomEvent("qs:track", { detail: { event, payload } }));
  }
}

/* ----------------------- Component ----------------------- */

function ProductCardImpl({
  id,
  name,
  price,
  image,
  featured = false,
  subtitle = null,
  position,
  prefetch = true,
  className = "",
  ownerControls = false,
  editHref,
  onDeletedAction,
}: Props) {
  const router = useRouter();
  const href = useMemo(() => `/product/${encodeURIComponent(id)}`, [id]);
  // Sensible default for editing products. Override via `editHref` if your app uses a different route.
  const hrefEdit = editHref ?? `/product/${encodeURIComponent(id)}/edit`;

  const url = image || "/placeholder/default.jpg";
  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const seenRef = useRef(false);

  // Make above-the-fold images priority for better LCP (e.g., first 8)
  const priority = typeof position === "number" ? position < 8 : false;

  // One-time product_view when first visible
  useEffect(() => {
    if (!anchorRef.current || seenRef.current || typeof window === "undefined") return;

    const el = anchorRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !seenRef.current) {
            seenRef.current = true;
            trackClient("product_view", { id, name, price, position });
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [id, name, price, position]);

  // Smart route prefetch: IO + hover/focus (best-effort)
  useEffect(() => {
    if (!prefetch || !anchorRef.current) return;
    const el = anchorRef.current;
    let done = false;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !done) {
            done = true;
            try {
              // App Router: Link prefetches, but this is a hint when visible
              (router as any)?.prefetch?.(href);
            } catch {}
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "300px" }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [href, prefetch, router]);

  const hoverPrefetch = useCallback(() => {
    if (!prefetch) return;
    try {
      (router as any)?.prefetch?.(href);
    } catch {}
  }, [href, prefetch, router]);

  const onClick = useCallback(() => {
    trackClient("product_click", { id, name, price, position, href });
  }, [id, name, price, position, href]);

  const priceText = useMemo(() => formatKES(price), [price]);

  // ✅ Only pass blurDataURL when using "blur" placeholder
  const blurProps = useMemo<
    | { placeholder: "blur"; blurDataURL: string }
    | { placeholder: "empty" }
  >(
    () =>
      priority
        ? { placeholder: "blur", blurDataURL: getBlurDataURL(640, 360) }
        : { placeholder: "empty" },
    [priority]
  );

  return (
    <div
      className={[
        "group relative block rounded-xl border bg-white p-3 shadow-sm will-change-transform",
        "border-black/5 hover:border-black/10 hover:shadow-md",
        "dark:bg-gray-900 dark:border-white/10 dark:hover:border-white/15",
        className,
      ].join(" ")}
      data-product-id={id}
    >
      {/* Action overlay (owner mode) */}
      {ownerControls && (
        <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
          <Link
            href={hrefEdit}
            className="rounded border bg-white/90 px-2 py-1 text-xs hover:bg-white dark:bg-gray-900"
            title="Edit product"
            aria-label="Edit product"
          >
            Edit
          </Link>

          {/* exactOptionalPropertyTypes safe: only pass when defined */}
          <DeleteListingButton
            productId={id}
            label="Delete"
            {...(onDeletedAction ? { afterDeleteAction: onDeletedAction } : {})}
          />
        </div>
      )}

      {/* Featured badge */}
      {featured && (
        <span
          className="absolute left-3 top-3 z-10 select-none rounded-md bg-[#161748] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white shadow"
          aria-hidden="true"
        >
          FEATURED
        </span>
      )}

      {/* Clickable media/title area */}
      <Link
        href={href}
        prefetch={prefetch}
        onMouseEnter={hoverPrefetch}
        onFocus={hoverPrefetch}
        onClick={onClick}
        ref={anchorRef}
        title={name}
      >
        <div className="relative h-40 w-full overflow-hidden rounded-lg border border-white/10 dark:border-white/10">
          <SmartImage
            src={url}
            alt={name || "Product image"}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            priority={priority}
            {...blurProps}
          />
        </div>

        <div className="mt-2 space-y-1">
          <div className="line-clamp-1 font-medium text-gray-900 dark:text-gray-100">{name}</div>
          {subtitle ? (
            <div className="line-clamp-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</div>
          ) : null}
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">{priceText}</div>
        </div>
      </Link>
    </div>
  );
}

(ProductCardImpl as any).displayName = "ProductCard";

export default memo(ProductCardImpl);
