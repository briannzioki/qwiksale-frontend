// src/app/components/SellerInfo.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import VerifiedBadge from "@/app/components/VerifiedBadge";
import DonateButton from "@/app/components/DonateButton";

type SellerInfoProps = {
  /** Panel label – e.g. "Seller" or "Provider". */
  label?: string;

  sellerId?: string | null;
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;

  /** Human-readable location (e.g. "Nairobi CBD"). */
  locationLabel?: string | null;

  /** Google Maps link / store location URL. */
  storeLocationUrl?: string | null;

  memberSince?: string | null;
  rating?: number | null;
  salesCount?: number | null;
  verified?: boolean;

  /** Store URL (/store/:slug or /store/u-:id). */
  storeHref?: string | null;

  /** Seller id to feed into DonateButton. */
  donateSellerId?: string | null;

  /** Optional contact CTA (ContactModal / ContactModalService). */
  contactSlot?: React.ReactNode;

  className?: string;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fallbackAvatarLetter(name?: string | null) {
  if (!name) return "S";
  const t = name.trim();
  if (!t) return "S";
  return t[0]!.toUpperCase();
}

export default function SellerInfo({
  label = "Seller",
  sellerId,
  username,
  name,
  avatarUrl,
  locationLabel,
  storeLocationUrl,
  memberSince,
  rating,
  salesCount,
  verified,
  storeHref,
  donateSellerId,
  contactSlot,
  className,
}: SellerInfoProps) {
  const safeName =
    name?.trim() ||
    username?.trim() ||
    "Seller";

  const showMetaRow =
    (typeof rating === "number" && rating > 0) ||
    (typeof salesCount === "number" &&
      salesCount > 0) ||
    !!memberSince;

  const showStoreLocationLink =
    typeof storeLocationUrl === "string" &&
    storeLocationUrl.trim().length > 0;

  const hasDonate = Boolean(donateSellerId);

  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        className,
      )}
      data-seller-id={sellerId || undefined}
    >
      <h3 className="mb-3 font-semibold text-foreground">
        {label}
      </h3>

      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted text-sm font-semibold text-foreground ring-2 ring-background/80 ring-offset-2 ring-offset-background">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {fallbackAvatarLetter(safeName)}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2 text-sm text-foreground">
          {/* Name + username + verified */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">
              {safeName}
            </span>
            {username && (
              <span className="text-xs text-muted-foreground">
                @{username}
              </span>
            )}
            {verified && (
              <VerifiedBadge className="inline-flex" />
            )}
          </div>

          {/* Basic location */}
          {locationLabel && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">
                Location:
              </span>{" "}
              {locationLabel}
            </p>
          )}

          {/* Meta row: rating, sales, member since */}
          {showMetaRow && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.75rem] text-muted-foreground">
              {typeof rating === "number" && rating > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                  <span aria-hidden>⭐</span>
                  <span className="font-medium">
                    {rating.toFixed(1)}
                  </span>
                  <span>rating</span>
                </span>
              )}

              {typeof salesCount === "number" &&
                salesCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                    <span aria-hidden>✓</span>
                    <span className="font-medium">
                      {salesCount}
                    </span>
                    <span>sales</span>
                  </span>
                )}

              {memberSince && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                  <span aria-hidden>📅</span>
                  <span>Since {memberSince}</span>
                </span>
              )}
            </div>
          )}

          {/* Store Google Maps location link */}
          {showStoreLocationLink && (
            <div className="mt-2">
              <a
                href={storeLocationUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-brandBlue hover:underline"
                data-testid="seller-map-link"
              >
                <span aria-hidden>📍</span>
                <span>View on Google Maps</span>
              </a>
            </div>
          )}

          {/* CTAs: contact, visit store, donate */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {contactSlot}

            {storeHref && (
              <Link
                href={storeHref}
                prefetch={false}
                className="btn-outline"
                aria-label="Visit store"
                data-testid="visit-store-link"
              >
                Visit Store
              </Link>
            )}

            {hasDonate && (
              <DonateButton
                {...({ sellerId: donateSellerId } as any)}
              />
            )}
          </div>

          <p className="mt-3 text-[0.7rem] leading-relaxed text-muted-foreground">
            Stay safe: meet in public places, verify
            details before paying, and report suspicious
            activity.
          </p>
        </div>
      </div>
    </section>
  );
}
