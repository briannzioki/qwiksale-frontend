"use client";

import * as React from "react";
import Link from "next/link";
import VerifiedBadge from "@/app/components/VerifiedBadge";
import DonateButton from "@/app/components/DonateButton";
import {
  normalizeFeaturedTier,
  sellerVerifiedFromEmailVerified,
  type FeaturedTier,
} from "@/app/lib/sellerVerification";

type SellerBadgesWire = {
  verified?: boolean | null;
  tier?: FeaturedTier | string | null;
} | null;

type SellerInfoProps = {
  label?: string;

  sellerId?: string | null;
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;

  locationLabel?: string | null;
  storeLocationUrl?: string | null;

  memberSince?: string | null;
  rating?: number | null;
  salesCount?: number | null;

  verified?: boolean | null | string | number | Date;
  featuredTier?: FeaturedTier | null | string;

  sellerBadges?: SellerBadgesWire;

  storeHref?: string | null;
  donateSellerId?: string | null;

  contactSlot?: React.ReactNode;
  className?: string;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function normalizeSlug(raw?: string | null) {
  let v = "";
  try {
    v = decodeURIComponent(String(raw ?? "")).trim();
  } catch {
    v = String(raw ?? "").trim();
  }
  return v.replace(/^@+/, "");
}

function stripLeadingUPrefixes(v: string) {
  let cur = String(v || "").trim();
  for (let i = 0; i < 3; i++) {
    const m = /^u-(.+)$/i.exec(cur);
    if (!m?.[1]) break;
    cur = m[1].trim();
  }
  return cur;
}

function isJunkToken(v: string) {
  const s = String(v || "").trim().toLowerCase();
  return s === "undefined" || s === "null" || s === "nan";
}

function cleanUsername(raw?: string | null): string {
  const v = normalizeSlug(raw);
  if (!v) return "";
  return /^[a-z0-9._-]{2,64}$/i.test(v) ? v : "";
}

function cleanSellerId(raw?: string | null): string | null {
  const v = normalizeSlug(raw);
  if (!v) return null;

  const tail = stripLeadingUPrefixes(v);
  if (!tail || isJunkToken(tail)) return null;
  if (tail.length > 80) return null;

  return v;
}

const UUIDISH_RE = /^[0-9a-f-]{24,36}$/i;
const STORE_TOKEN_RE = /^[a-z0-9._-]{2,80}$/i;

function isStoreCodeToken(raw: string): boolean {
  const s = normalizeSlug(raw);
  if (!s || isJunkToken(s)) return false;
  if (/^(?:sto|store)[-_]?\d{1,18}$/i.test(s)) return true;
  if (/^\d{1,18}$/.test(s)) return true;
  return false;
}

function sellerIdTailFromAny(raw?: string | null): string | null {
  const v = normalizeSlug(raw);
  if (!v) return null;
  const tail = stripLeadingUPrefixes(v);
  if (!tail || isJunkToken(tail)) return null;
  if (tail.length > 80) return null;

  if (isStoreCodeToken(tail)) return null;
  return tail;
}

function splitPathSuffix(href: string): { path: string; suffix: string } {
  const s = String(href || "");
  const idx = s.search(/[?#]/);
  if (idx === -1) return { path: s, suffix: "" };
  return { path: s.slice(0, idx), suffix: s.slice(idx) };
}

function tokenFromStorePath(hrefPath: string): string | null {
  const { path } = splitPathSuffix(hrefPath);
  const p = path.startsWith("/") ? path : `/${path}`;
  const parts = p.split("/").filter(Boolean);
  const i = parts.findIndex((x) => x.toLowerCase() === "store");
  const token = i >= 0 ? parts[i + 1] : undefined;
  return token ? normalizeSlug(token) : null;
}

function buildStoreHref({
  storeHref,
  username,
  sellerId,
}: {
  storeHref?: string | null;
  username?: string | null;
  sellerId?: string | null;
}): string | null {
  const sidTail = sellerIdTailFromAny(sellerId);

  const unameRaw = cleanUsername(username ?? null);
  const preferredUsername = unameRaw && !isStoreCodeToken(unameRaw) ? unameRaw : "";

  const directRaw = typeof storeHref === "string" ? storeHref.trim() : "";
  const hasDirect = !!directRaw && !isJunkToken(directRaw);

  // 1) Prefer username when valid (pretty slug).
  if (preferredUsername) return `/store/${encodeURIComponent(preferredUsername)}`;

  // 2) Fall back to u-<id> when we have a real seller id tail.
  if (sidTail) return `/store/${encodeURIComponent(`u-${sidTail}`)}`;

  // 3) Absolute URL passthrough.
  if (hasDirect && /^https?:\/\//i.test(directRaw)) return directRaw;

  // 4) App-relative passthrough if it's not already a store path.
  if (hasDirect && directRaw.startsWith("/") && !directRaw.startsWith("/store/")) return directRaw;

  // 5) Try to interpret storeHref as /store/<token>, but reject store-code-ish tokens.
  if (hasDirect) {
    const isStorePath = directRaw.startsWith("/store/") || directRaw.startsWith("store/");
    const token = isStorePath ? tokenFromStorePath(directRaw) : normalizeSlug(directRaw);

    if (token && !isJunkToken(token)) {
      const { suffix } = isStorePath ? splitPathSuffix(directRaw) : { suffix: "" };

      if (isStoreCodeToken(token)) return null;

      const tail = stripLeadingUPrefixes(token);
      const isUPath = /^u-/i.test(token);
      const looksIdish = isUPath || UUIDISH_RE.test(tail);

      if (looksIdish && tail && !isJunkToken(tail) && !isStoreCodeToken(tail)) {
        return `/store/${encodeURIComponent(`u-${tail}`)}${suffix}`;
      }

      if (STORE_TOKEN_RE.test(token) && !isStoreCodeToken(token)) {
        return `/store/${encodeURIComponent(token)}${suffix}`;
      }
    }
  }

  // 6) Final: accept username again only if it's not store-code-ish.
  if (unameRaw && STORE_TOKEN_RE.test(unameRaw) && !isJunkToken(unameRaw) && !isStoreCodeToken(unameRaw)) {
    return `/store/${encodeURIComponent(unameRaw)}`;
  }

  return null;
}

function fallbackAvatarLetter(v?: string | null) {
  if (!v) return "S";
  const t = v.trim();
  if (!t) return "S";
  const first = t.replace(/^@+/, "")[0];
  return (first ? first : "S").toUpperCase();
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
  featuredTier,
  sellerBadges,
  storeHref,
  donateSellerId,
  contactSlot,
  className,
}: SellerInfoProps) {
  const safeUsername = React.useMemo(() => cleanUsername(username ?? null), [username]);
  const safeSellerId = React.useMemo(() => cleanSellerId(sellerId ?? null), [sellerId]);
  const safeDonateId = React.useMemo(() => cleanSellerId(donateSellerId ?? null), [donateSellerId]);

  const safeName = React.useMemo(() => {
    const n = typeof name === "string" ? name.trim() : "";
    return n ? n : "Seller";
  }, [name]);

  // UI: show @username first (primary), but keep the human name visible (secondary) when it differs.
  const primaryLabel = safeUsername ? `@${safeUsername}` : safeName;
  const secondaryName =
    safeUsername && safeName && safeName.toLowerCase() !== safeUsername.toLowerCase()
      ? safeName
      : null;

  const { verifiedCanon, tierCanon } = React.useMemo(() => {
    const wire =
      sellerBadges && typeof sellerBadges === "object" && !Array.isArray(sellerBadges)
        ? sellerBadges
        : null;

    const hasWireVerified = !!wire && "verified" in (wire as object);
    const hasWireTier = !!wire && "tier" in (wire as object);

    const resolvedTier: FeaturedTier | null = (() => {
      if (hasWireTier) return normalizeFeaturedTier((wire as any)?.tier);
      return normalizeFeaturedTier(featuredTier);
    })();

    const resolvedVerified: boolean | null = (() => {
      if (hasWireVerified) {
        const v = (wire as any)?.verified;
        return typeof v === "boolean" ? v : null;
      }

      if (typeof verified === "boolean") return verified;
      if (verified === null) return null;

      if (verified !== undefined) return sellerVerifiedFromEmailVerified(verified);

      return null;
    })();

    return { verifiedCanon: resolvedVerified, tierCanon: resolvedTier };
  }, [verified, featuredTier, sellerBadges]);

  const verifiedLabel = React.useMemo(() => {
    if (verifiedCanon === true) return "Verified";
    if (verifiedCanon === false) return "Unverified";
    return null;
  }, [verifiedCanon]);

  const showMetaRow =
    (typeof rating === "number" && rating > 0) ||
    (typeof salesCount === "number" && salesCount > 0) ||
    !!memberSince;

  const showStoreLocationLink =
    typeof storeLocationUrl === "string" && storeLocationUrl.trim().length > 0;

  const safeStoreHref = React.useMemo(
    () =>
      buildStoreHref({
        storeHref: storeHref ?? null,
        username: safeUsername || null,
        sellerId: safeSellerId ?? null,
      }),
    [storeHref, safeUsername, safeSellerId],
  );

  const hasDonate = typeof safeDonateId === "string" && safeDonateId.length > 0;
  const AnyDonateButton = DonateButton as unknown as React.ComponentType<any>;

  return (
    <section
      className={cn(
        "rounded-xl border bg-[var(--bg-elevated)] p-3 text-[var(--text)] shadow-sm sm:p-4",
        "border-[var(--border-subtle)]",
        className,
      )}
      data-seller-id={safeSellerId ? stripLeadingUPrefixes(safeSellerId) : undefined}
    >
      <h3 className="mb-2 text-xs font-extrabold tracking-tight text-[var(--text)] sm:mb-3 sm:text-sm">
        {label}
      </h3>

      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-full",
            "bg-[var(--bg-subtle)] text-sm font-semibold text-[var(--text)]",
            "ring-1 ring-[var(--border-subtle)] ring-offset-2 ring-offset-[var(--bg-elevated)]",
          )}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {fallbackAvatarLetter(primaryLabel)}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-1.5 text-sm text-[var(--text)] sm:space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-[var(--text)]">{primaryLabel}</span>

            {secondaryName ? (
              <span className="text-[11px] text-[var(--text-muted)] sm:text-xs">{secondaryName}</span>
            ) : null}

            <VerifiedBadge className="inline-flex" verified={verifiedCanon} featuredTier={tierCanon} />

            {verifiedLabel ? (
              <span
                data-testid="seller-verified-label"
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold leading-none sm:px-2.5 sm:py-1.5 sm:text-xs",
                  "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text)]",
                )}
                aria-label={verifiedLabel}
                title={verifiedLabel}
              >
                {verifiedLabel}
              </span>
            ) : null}
          </div>

          {locationLabel ? (
            <p className="text-[11px] leading-relaxed text-[var(--text-muted)] sm:text-xs">
              <span className="font-medium text-[var(--text)]">Location:</span> {locationLabel}
            </p>
          ) : null}

          {showMetaRow ? (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)] sm:text-xs">
              {typeof rating === "number" && rating > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 leading-none sm:py-0.5">
                  <span aria-hidden>⭐</span>
                  <span className="font-medium text-[var(--text)]">{rating.toFixed(1)}</span>
                  <span>rating</span>
                </span>
              ) : null}

              {typeof salesCount === "number" && salesCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 leading-none sm:py-0.5">
                  <span aria-hidden>✓</span>
                  <span className="font-medium text-[var(--text)]">{salesCount}</span>
                  <span>sales</span>
                </span>
              ) : null}

              {memberSince ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 leading-none sm:py-0.5">
                  <span aria-hidden>📅</span>
                  <span>Since {memberSince}</span>
                </span>
              ) : null}
            </div>
          ) : null}

          {showStoreLocationLink ? (
            <div className="mt-2">
              <a
                href={storeLocationUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-xs font-semibold",
                  "border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)]",
                  "hover:bg-[var(--bg-subtle)]",
                  "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                  "active:scale-[.99]",
                )}
                data-testid="seller-map-link"
              >
                <span aria-hidden>📍</span>
                <span>View on Google Maps</span>
              </a>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4">
            {contactSlot}

            {safeStoreHref ? (
              <Link
                href={safeStoreHref}
                prefetch={false}
                aria-label="Visit store"
                data-testid="visit-store-link"
                className={cn(
                  "inline-flex h-9 items-center justify-center rounded-xl border px-3 text-xs font-semibold shadow-sm transition sm:text-sm",
                  "border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)]",
                  "hover:bg-[var(--bg-subtle)]",
                  "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                  "active:scale-[.99]",
                )}
              >
                Visit Store
              </Link>
            ) : null}

            {hasDonate ? <AnyDonateButton sellerId={stripLeadingUPrefixes(safeDonateId!)} /> : null}
          </div>

          <p className="mt-2 text-[0.7rem] leading-relaxed text-[var(--text-muted)] sm:mt-3">
            Stay safe: meet in public places, verify details before paying, and report suspicious activity.
          </p>
        </div>
      </div>
    </section>
  );
}
