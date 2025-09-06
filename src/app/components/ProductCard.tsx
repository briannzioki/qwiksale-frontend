// src/app/components/ProductCard.tsx
"use client";

import React, { useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { shimmer as shimmerMaybe } from "@/app/lib/blur";

type Props = {
  id: string;
  name: string;
  price?: number | null;
  image?: string | null;
  featured?: boolean;
  position?: number;
  prefetch?: boolean;
  className?: string;
};

/* ----------------------- Utils ----------------------- */

function formatKES(value: number) {
  try {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `KSh ${Number(value).toLocaleString("en-KE")}`;
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

/* ----------------------- Analytics: client-only event bus ----------------------- */

function trackClient(event: string, payload?: Record<string, unknown>) {
  // Always log in dev so you see events flowing
  // eslint-disable-next-line no-console
  console.log("[qs:track]", event, payload);
  if (typeof window !== "undefined" && "CustomEvent" in window) {
    window.dispatchEvent(new CustomEvent("qs:track", { detail: { event, payload } }));
  }
}

/* ----------------------- Component ----------------------- */

export default function ProductCard({
  id,
  name,
  price,
  image,
  featured = false,
  position,
  prefetch = true,
  className = "",
}: Props) {
  const url = image || "/placeholder/default.jpg";
  const cardRef = useRef<HTMLAnchorElement | null>(null);
  const seenRef = useRef(false);

  // One-time product_view when first visible
  useEffect(() => {
    if (!cardRef.current || seenRef.current || typeof window === "undefined") return;

    const el = cardRef.current;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !seenRef.current) {
          seenRef.current = true;
          trackClient("product_view", { id, name, price, position });
          io.disconnect();
          break;
        }
      }
    });

    io.observe(el);
    return () => io.disconnect();
  }, [id, name, price, position]);

  const onClick = useCallback(() => {
    trackClient("product_click", { id, name, price, position, href: `/product/${id}` });
  }, [id, name, price, position]);

  return (
    <Link
      href={`/product/${id}`}
      prefetch={prefetch}
      onClick={onClick}
      ref={cardRef}
      className={[
        "group relative block rounded-xl border bg-white p-3 shadow-sm",
        "hover:shadow-md hover:border-gray-200",
        "dark:bg-gray-900 dark:border-gray-800 dark:hover:border-gray-700",
        className,
      ].join(" ")}
      aria-label={`${name}${typeof price === "number" ? `, priced at ${formatKES(price)}` : ""}`}
    >
      {/* Featured badge */}
      {featured && (
        <span
          className="absolute left-3 top-3 z-10 select-none rounded-md bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white shadow"
          aria-hidden="true"
        >
          FEATURED
        </span>
      )}

      {/* Image */}
      <div className="relative w-full h-40 overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800">
        <Image
          src={url}
          alt={name || "Product image"}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          placeholder="blur"
          blurDataURL={getBlurDataURL(640, 360)}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          priority={false}
        />
      </div>

      {/* Meta */}
      <div className="space-y-1">
        <div className="font-medium line-clamp-1 text-gray-900 dark:text-gray-100" title={name}>
          {name}
        </div>
        {typeof price === "number" ? (
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {formatKES(price)}
          </div>
        ) : (
          <div className="text-xs text-gray-500 dark:text-gray-400">Price on request</div>
        )}
      </div>
    </Link>
  );
}
