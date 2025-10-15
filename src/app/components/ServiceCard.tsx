// src/app/components/ServiceCard.tsx
"use client";

import React, { memo, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SmartImage from "@/app/components/SmartImage";
import { shimmer as shimmerMaybe } from "@/app/lib/blur";
import DeleteListingButton from "@/app/components/DeleteListingButton"; // ✅ canonical import

type Props = {
  id: string;
  name: string;
  image?: string | null;
  price?: number | null;
  rateType?: "hour" | "day" | "fixed" | null;
  serviceArea?: string | null;
  availability?: string | null;
  featured?: boolean;
  position?: number;
  prefetch?: boolean;
  className?: string;

  /** Dashboard mode: show Edit/Delete controls */
  ownerControls?: boolean;
  /** Optional custom edit href (defaults to /service/:id/edit) */
  editHref?: string;
  /** Called after a successful delete */
  onDeletedAction?: () => void;
};

const PLACEHOLDER = "/placeholder/default.jpg";

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

const FALLBACK_BLUR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMB9l9b3a8AAAAASUVORK5CYII=";

function getBlurDataURL(width = 640, height = 640): string {
  try {
    const fn: any = shimmerMaybe;
    if (typeof fn === "function") {
      if (fn.length >= 2) return fn(width, height);
      return fn({ width, height });
    }
  } catch {}
  return FALLBACK_BLUR;
}

function track(event: string, payload?: Record<string, unknown>) {
  console.log("[qs:track]", event, payload);
  if (typeof window !== "undefined" && "CustomEvent" in window) {
    window.dispatchEvent(new CustomEvent("qs:track", { detail: { event, payload } }));
  }
}

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
  ownerControls = false,
  editHref,
  onDeletedAction,
}: Props) {
  const router = useRouter();
  const href = useMemo(() => `/service/${encodeURIComponent(id)}`, [id]);
  const hrefEdit = editHref ?? `/service/${encodeURIComponent(id)}/edit`; // ← default

  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const seenRef = useRef(false);

  const priority = typeof position === "number" ? position < 8 : false;

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

  const src = image || PLACEHOLDER;
  const blurProps = priority
    ? { placeholder: "blur" as const, blurDataURL: getBlurDataURL(640, 640) }
    : { placeholder: "empty" as const };

  return (
    <div
      className={[
        "group relative overflow-hidden rounded-xl border bg-white shadow-sm transition will-change-transform",
        "hover:-translate-y-0.5 hover:shadow-md",
        "border-black/5 dark:border-slate-800 dark:bg-slate-900",
        className,
      ].join(" ")}
      data-service-id={id}
    >
      {/* Owner actions overlay */}
      {ownerControls && (
        <div className="absolute right-2 top-2 z-20 flex items-center gap-2">
          <Link
            href={hrefEdit}
            className="rounded border bg-white/90 px-2 py-1 text-xs hover:bg-white dark:bg-gray-900"
            title="Edit service"
            aria-label="Edit service"
            onClick={(e) => e.stopPropagation()}
          >
            Edit
          </Link>

          {/* Stop navigation bubbling when deleting */}
          <div
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="contents"
          >
            <DeleteListingButton
              serviceId={id}
              label=""
              className="px-2 py-1"
              {...(onDeletedAction ? { onDeletedAction } : {})}
            />
          </div>
        </div>
      )}

      <Link
        href={href}
        prefetch={prefetch}
        onMouseEnter={hoverPrefetch}
        onFocus={hoverPrefetch}
        onClick={onClick}
        ref={anchorRef}
        title={name}
        className="block"
      >
        <div className="relative aspect-square w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
          <SmartImage
            src={src}
            alt={name || "Service image"}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            priority={priority}
            {...blurProps}
            unoptimized
          />
          {featured && (
            <span className="absolute left-2 top-2 rounded-md bg-[#161748] px-2 py-1 text-xs font-semibold text-white shadow">
              Featured
            </span>
          )}
        </div>

        <div className="p-3">
          <div className="line-clamp-1 font-semibold text-gray-900 dark:text-gray-100">{name}</div>
          <div className="mt-0.5 text-sm text-gray-600 dark:text-slate-300">{subText}</div>
          <div className="mt-1 text-[15px] font-bold text-[#161748] dark:text-white">{priceText}</div>
        </div>
      </Link>
    </div>
  );
}

(ServiceCardImpl as any).displayName = "ServiceCard";
export default memo(ServiceCardImpl);
