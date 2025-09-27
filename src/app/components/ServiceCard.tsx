// src/app/components/ServiceCard.tsx
"use client";

import React, { memo, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SmartImage from "@/app/components/SmartImage";
import { shimmer as shimmerMaybe } from "@/app/lib/blur";

type Props = {
  id: string;
  name: string;
  image?: string | null;
  price?: number | null;
  rateType?: "hour" | "day" | "fixed" | null;
  serviceArea?: string | null;
  availability?: string | null;
  featured?: boolean;
  /** 0-based position in feed (helps LCP & analytics) */
  position?: number;
  /** Next.js Link prefetch (default true) */
  prefetch?: boolean;
  className?: string;
};

/* ----------------------- Utils ----------------------- */

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "Contact for quote";
  try {
    return `KES ${new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}
function rateSuffix(rt?: Props["rateType"]) {
  if (rt === "hour") return "/hr";
  if (rt === "day") return "/day";
  return "";
}

// Tiny 1×1 transparent PNG as last-resort blur
const FALLBACK_BLUR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMB9l9b3a8AAAAASUVORK5CYII=";

// Accept both shimmer(w, h) and shimmer({ width, height })
function getBlurDataURL(width = 640, height = 640): string {
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

function track(event: string, payload?: Record<string, unknown>) {
  // light client-side analytics hook
  // eslint-disable-next-line no-console
  console.log("[qs:track]", event, payload);
  if (typeof window !== "undefined" && "CustomEvent" in window) {
    window.dispatchEvent(new CustomEvent("qs:track", { detail: { event, payload } }));
  }
}

/* ----------------------- Component ----------------------- */

function ServiceCardImpl({
  id,
  name,
  image,
  price,
  rateType,
  serviceArea,
  availability,
  featured = false,
  position,
  prefetch = true,
  className = "",
}: Props) {
  const router = useRouter();
  const href = useMemo(() => `/service/${encodeURIComponent(id)}`, [id]);

  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const seenRef = useRef(false);

  // Make above-the-fold thumbs priority for faster LCP (tweak threshold if needed)
  const priority = typeof position === "number" ? position < 8 : false;

  // Presentable price text (avoid "/hr" when quoting)
  const priceText = useMemo(() => {
    const base = fmtKES(price);
    const withRate =
      typeof price === "number" && Number.isFinite(price) && price > 0 ? rateSuffix(rateType) : "";
    return withRate ? `${base} ${withRate}` : base;
  }, [price, rateType]);

  const subText = useMemo(
    () => [serviceArea || "Available", availability].filter(Boolean).join(" • "),
    [serviceArea, availability]
  );

  // One-time view tracking when card first becomes visible
  useEffect(() => {
    if (!anchorRef.current || seenRef.current || typeof window === "undefined") return;

    const el = anchorRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !seenRef.current) {
            seenRef.current = true;
            track("service_view", { id, name, price, rateType, position, href });
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -20% 0px" }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [id, name, price, rateType, position, href]);

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
    track("service_click", { id, name, price, rateType, position, href });
  }, [id, name, price, rateType, position, href]);

  const src = image || "/placeholder/default.jpg";
  const aria = `${name}${price ? `, ${priceText}` : ""}`;

  // Only pass a blurDataURL when using "blur" placeholder
  const blurProps = priority
    ? { placeholder: "blur" as const, blurDataURL: getBlurDataURL(640, 640) }
    : { placeholder: "empty" as const };

  return (
    <Link
      href={href}
      prefetch={prefetch}
      onMouseEnter={hoverPrefetch}
      onFocus={hoverPrefetch}
      onClick={onClick}
      ref={anchorRef}
      className={[
        "group relative overflow-hidden rounded-xl border bg-white shadow-sm transition will-change-transform",
        "hover:-translate-y-0.5 hover:shadow-md",
        "border-black/5 dark:border-slate-800 dark:bg-slate-900",
        className,
      ].join(" ")}
      aria-label={aria}
      title={name}
      role="article"
      data-service-id={id}
    >
      {/* Image */}
      <div className="relative aspect-square w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        <SmartImage
          src={src}
          alt={name || "Service image"}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          priority={priority}
          {...blurProps}
        />

        {featured && (
          <span className="absolute left-2 top-2 rounded-md bg-[#161748] px-2 py-1 text-xs font-semibold text-white shadow">
            Featured
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3">
        <div className="line-clamp-1 font-semibold text-gray-900 dark:text-gray-100" title={name}>
          {name}
        </div>
        <div className="mt-0.5 text-sm text-gray-600 dark:text-slate-300">{subText}</div>
        <div className="mt-1 text-[15px] font-bold text-[#161748] dark:text-white">{priceText}</div>
      </div>
    </Link>
  );
}

(ServiceCardImpl as any).displayName = "ServiceCard";

export default memo(ServiceCardImpl);
