// src/app/components/ListingCard.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Icon } from "@/app/components/Icon";
import { Badge } from "@/app/components/Badge";
import { Button } from "@/app/components/Button";

type Kind = "product" | "service";

export type ListingCardProps = {
  id: string;
  href: string;
  title: string;
  price: number | string;
  currency?: "KES" | string;
  imageUrl?: string | null;
  location?: string;
  verified?: boolean;
  saved?: boolean;
  kind?: Kind;
  conditionLabel?: string;
  featured?: boolean;
  className?: string;

  /** ✅ App Router-safe function prop (ends with `Action`) */
  onToggleSaveAction?: (next: boolean) => void | Promise<void>;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatPrice(value: number | string, currency = "KES") {
  if (typeof value === "string") return value;
  try {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString("en-KE")}`;
  }
}

export default function ListingCard({
  id,
  href,
  title,
  price,
  currency = "KES",
  imageUrl,
  location,
  verified,
  saved = false,
  kind = "product",
  conditionLabel,
  featured = false,
  className,
  onToggleSaveAction,
}: ListingCardProps) {
  const [isSaved, setIsSaved] = React.useState(!!saved);
  const [busy, setBusy] = React.useState(false);

  async function handleSaveToggle(e: React.MouseEvent) {
    e.preventDefault();
    if (busy) return;
    const next = !isSaved;
    setIsSaved(next); // optimistic
    try {
      setBusy(true);
      await onToggleSaveAction?.(next);
    } catch {
      setIsSaved(!next); // revert on failure
    } finally {
      setBusy(false);
    }
  }

  const priceText = formatPrice(price, currency);

  return (
    <article
      className={cn(
        // Border-only card (no box shadow) for lighter weight
        "group relative overflow-hidden rounded-2xl border border-black/5 dark:border-white/10 bg-white dark:bg-slate-900",
        "transition hover:border-black/10 dark:hover:border-white/15",
        featured && "ring-1 ring-brandBlue/30",
        className
      )}
    >
      <Link href={href} prefetch={false} aria-labelledby={`listing-${id}-title`}>
        {/* Cover */}
        <div className="relative overflow-hidden">
          <div className="aspect-[4/3] w-full">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 25vw"
                className={cn(
                  "object-cover transition-transform duration-300",
                  "group-hover:scale-[1.03]"
                )}
                priority={false}
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-800 dark:to-slate-900 grid place-items-center">
                <Icon name="image" className="opacity-40" />
              </div>
            )}
          </div>

          {/* Favorite with subtle backdrop for legibility */}
          <button
            type="button"
            onClick={handleSaveToggle}
            aria-pressed={isSaved ? "true" : "false"}
            aria-label={isSaved ? "Unfavorite" : "Favorite"}
            className={cn(
              "absolute right-2 top-2 z-10 inline-flex h-9 w-9 items-center justify-center",
              "rounded-full border border-black/10 dark:border-white/10",
              "backdrop-blur-md bg-white/60 dark:bg-slate-900/50", // stronger backdrop for bright photos
              "transition hover:bg-white/80 dark:hover:bg-slate-900/70",
              isSaved && "ring-2 ring-brandPink/40"
            )}
          >
            <span
              className={cn(
                "absolute inset-0 rounded-full",
                "bg-gradient-to-br from-white/40 to-white/10 dark:from-slate-900/40 dark:to-slate-900/10"
              )}
              aria-hidden
            />
            <Icon
              name="heart"
              className={cn(
                "relative",
                isSaved ? "text-pink-600 dark:text-pink-400" : "text-gray-700 dark:text-slate-200"
              )}
              aria-hidden
            />
          </button>

          {/* Price badge */}
          <div className="absolute left-2 top-2 z-10">
            <Badge tone="indigo" variant="soft" glow>
              {priceText}
            </Badge>
          </div>

          {/* Bottom overlay + meta */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"
            aria-hidden
          />
          <div className="absolute inset-x-0 bottom-0 p-3 md:p-3.5 text-white">
            <div className="flex items-center gap-1.5 text-xs opacity-90">
              {verified ? (
                <>
                  <Icon name="verified" className="text-emerald-300" aria-hidden />
                  <span className="sr-only">Verified</span>
                </>
              ) : null}
              {location ? (
                <span className="flex items-center gap-1">
                  <Icon name="pin" aria-hidden />
                  {location}
                </span>
              ) : null}
              {conditionLabel ? <span className="hidden sm:inline">• {conditionLabel}</span> : null}
              {kind === "service" ? <span className="hidden sm:inline">• Service</span> : null}
            </div>
            <h3
              id={`listing-${id}-title`}
              className="mt-1 line-clamp-2 text-sm font-semibold leading-snug drop-shadow"
            >
              {title}
            </h3>
          </div>
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
            {verified ? (
              <Badge tone="green" variant="soft">
                <Icon name="secure" aria-hidden /> Verified
              </Badge>
            ) : (
              <Badge tone="slate" variant="soft">
                <Icon name="info" aria-hidden /> Community
              </Badge>
            )}
          </div>

          <Button asChild size="xs" variant="subtle" className="px-2 py-1">
            <span>
              View <span className="sr-only">{title}</span>
            </span>
          </Button>
        </div>
      </Link>
    </article>
  );
}
