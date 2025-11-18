"use client";

import React, {
  memo,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SmartImage from "@/app/components/SmartImage";
import { shimmer as shimmerMaybe } from "@/app/lib/blur";
import DeleteListingButton from "@/app/components/DeleteListingButton";

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
const FALLBACK_BLUR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMB9l9b3a8AAAAASUVORK5CYII=";

function getBlurDataURL(width = 640, height = 640): string {
  try {
    const fn: unknown = shimmerMaybe;
    if (typeof fn === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyFn = fn as any;
      return anyFn.length >= 2
        ? anyFn(width, height)
        : anyFn({ width, height });
    }
  } catch {
    // ignore
  }
  return FALLBACK_BLUR;
}

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    return "Contact for quote";
  }
  try {
    return `KES ${new Intl.NumberFormat("en-KE", {
      maximumFractionDigits: 0,
    }).format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

function rateSuffix(rt?: Props["rateType"]) {
  if (rt === "hour") return "/hr";
  if (rt === "day") return "/day";
  return "";
}

function track(event: string, payload?: Record<string, unknown>) {
  if (typeof window !== "undefined" && "CustomEvent" in window) {
    window.dispatchEvent(
      new CustomEvent("qs:track", { detail: { event, payload } })
    );
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

  // Canonical service detail URL
  const href = useMemo(
    () => `/service/${encodeURIComponent(id)}`,
    [id]
  );
  const hrefEdit =
    editHref ?? `/service/${encodeURIComponent(id)}/edit`;

  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const seenRef = useRef(false);

  const priority = typeof position === "number" ? position < 8 : false;

  const priceText = useMemo(() => {
    const base = fmtKES(price);
    const withRate =
      typeof price === "number" &&
      Number.isFinite(price) &&
      price > 0
        ? rateSuffix(rateType)
        : "";
    return withRate ? `${base} ${withRate}` : base;
  }, [price, rateType]);

  const subText = useMemo(
    () =>
      [serviceArea || "Available", availability]
        .filter(Boolean)
        .join(" • "),
    [serviceArea, availability]
  );

  // Impression tracking
  useEffect(() => {
    if (!anchorRef.current || seenRef.current || typeof window === "undefined") {
      return;
    }
    const el = anchorRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !seenRef.current) {
            seenRef.current = true;
            track("service_view", {
              id,
              name,
              price,
              rateType,
              position,
              href,
            });
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

  // Prefetch when near viewport
  useEffect(() => {
    if (!prefetch || !anchorRef.current) return;
    let done = false;
    const el = anchorRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !done) {
            done = true;
            try {
              (router as unknown as {
                prefetch?: (u: string) => void;
              })?.prefetch?.(href);
            } catch {
              // ignore
            }
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
      (router as unknown as {
        prefetch?: (u: string) => void;
      })?.prefetch?.(href);
    } catch {
      // ignore
    }
  }, [href, prefetch, router]);

  const onClick = useCallback(() => {
    track("service_click", {
      id,
      name,
      price,
      rateType,
      position,
      href,
    });
  }, [id, name, price, rateType, position, href]);

  const src = image || PLACEHOLDER;
  const blurProps =
    priority
      ? ({
          placeholder: "blur" as const,
          blurDataURL: getBlurDataURL(640, 640),
        } as const)
      : ({ placeholder: "empty" as const } as const);

  return (
    <div
      className={[
        "group relative overflow-hidden rounded-xl border bg-white shadow-sm transition will-change-transform",
        "hover:-translate-y-0.5 hover:shadow-md",
        "border-black/5 dark:border-slate-800 dark:bg-slate-900",
        className,
      ].join(" ")}
      role="article"
      aria-label={name || "Service"}
      data-service-id={id}
      data-card="service"
    >
      {/* Owner controls overlay, outside main link */}
      {ownerControls && (
        <div className="absolute right-2 top-2 z-20 flex items-center gap-2">
          <Link
            href={hrefEdit}
            className="rounded border bg-white/90 px-2 py-1 text-xs hover:bg-white dark:border-slate-700 dark:bg-slate-900"
            title="Edit service"
            aria-label="Edit service"
            prefetch={false}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            Edit
          </Link>

          <div
            className="contents"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
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

      {/* Single canonical Link → /service/[id] */}
      <Link
        href={href}
        prefetch={prefetch}
        onMouseEnter={hoverPrefetch}
        onFocus={hoverPrefetch}
        onClick={onClick}
        ref={anchorRef}
        title={name}
        aria-label={`View service: ${name}`}
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161748]/50"
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
          />
          {featured && (
            <span className="absolute left-2 top-2 rounded-md bg-[#161748] px-2 py-1 text-xs font-semibold text-white shadow">
              Featured
            </span>
          )}
        </div>

        <div className="p-3">
          <div className="line-clamp-1 font-semibold text-gray-900 dark:text-gray-100">
            {name}
          </div>
          {subText && (
            <div className="mt-0.5 line-clamp-1 text-xs text-gray-600 dark:text-slate-300">
              {subText}
            </div>
          )}
          <div className="mt-1 text-[15px] font-bold text-[#161748] dark:text-[#39a0ca]">
            {priceText}
          </div>
        </div>
      </Link>
    </div>
  );
}

(ServiceCardImpl as unknown as { displayName?: string }).displayName =
  "ServiceCard";

export default memo(ServiceCardImpl);
