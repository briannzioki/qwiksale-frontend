// src/app/components/SellerInfo.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import VerifiedBadge from "@/app/components/VerifiedBadge";
import DonateButton from "@/app/components/DonateButton";

type FeaturedTier = "basic" | "gold" | "diamond";

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

  verified?: boolean | null;
  featuredTier?: FeaturedTier | null;

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

  // Accept either "<id>" or "u-<id>" but reject junk even if prefixed.
  const tail = stripLeadingUPrefixes(v);
  if (!tail || isJunkToken(tail)) return null;
  if (tail.length > 80) return null;

  // Return the original normalized input (could be prefixed), caller will normalize further.
  return v;
}

const UUIDISH_RE = /^[0-9a-f-]{24,36}$/i;
const STORE_TOKEN_RE = /^[a-z0-9._-]{2,80}$/i;

function isStoreCodeToken(raw: string): boolean {
  const s = normalizeSlug(raw);
  if (!s || isJunkToken(s)) return false;
  // e.g. Sto-83535 / sto_83535 / store-83535 / 83535
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

  // ✅ critical: never treat store-codes as a real sellerId
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

  // Prefer a normal username *only if it isn't a store-code-ish token*.
  const unameRaw = cleanUsername(username ?? null);
  const preferredUsername = unameRaw && !isStoreCodeToken(unameRaw) ? unameRaw : "";

  const directRaw = typeof storeHref === "string" ? storeHref.trim() : "";
  const hasDirect = !!directRaw && !isJunkToken(directRaw);

  // 1) If a real username exists, use it (pretty + stable).
  if (preferredUsername) {
    return `/store/${encodeURIComponent(preferredUsername)}`;
  }

  // 2) Next most reliable: sellerId (works even when username/store-codes are messy).
  if (sidTail) {
    return `/store/${encodeURIComponent(`u-${sidTail}`)}`;
  }

  // 3) If storeHref is an absolute URL, keep it (rare, but don't break).
  if (hasDirect && /^https?:\/\//i.test(directRaw)) return directRaw;

  // 4) If storeHref is app-relative but not a store link, keep it.
  if (hasDirect && directRaw.startsWith("/") && !directRaw.startsWith("/store/")) {
    return directRaw;
  }

  // 5) Otherwise, interpret whatever token we can get from storeHref,
  //    BUT never use store-code-ish tokens as the final slug.
  if (hasDirect) {
    const isStorePath = directRaw.startsWith("/store/") || directRaw.startsWith("store/");
    const token = isStorePath ? tokenFromStorePath(directRaw) : normalizeSlug(directRaw);

    if (token && !isJunkToken(token)) {
      const { suffix } = isStorePath ? splitPathSuffix(directRaw) : { suffix: "" };

      // ✅ if storeHref token is a store-code, don't use it as slug
      if (isStoreCodeToken(token)) {
        // if we somehow had a real sellerId tail, we'd have returned earlier.
        // Without it, better to hide the bad link than navigate to an empty store.
        return null;
      }

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

  // 6) Final attempt: accept username only if it isn't store-code-ish.
  if (
    unameRaw &&
    STORE_TOKEN_RE.test(unameRaw) &&
    !isJunkToken(unameRaw) &&
    !isStoreCodeToken(unameRaw)
  ) {
    return `/store/${encodeURIComponent(unameRaw)}`;
  }

  return null;
}

function fallbackAvatarLetter(name?: string | null) {
  if (!name) return "S";
  const t = name.trim();
  if (!t) return "S";
  return t[0]!.toUpperCase();
}

function FeaturedTierPill({ tier }: { tier: FeaturedTier }) {
  if (tier === "gold") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-yellow-300 bg-gradient-to-r from-yellow-200 via-yellow-100 to-yellow-300 px-2 py-0.5 text-[11px] font-semibold text-yellow-950 dark:border-yellow-900/40 dark:from-yellow-900/30 dark:via-yellow-900/10 dark:to-yellow-900/30 dark:text-yellow-100">
        <span aria-hidden>★</span>
        <span>Featured Gold</span>
      </span>
    );
  }

  if (tier === "diamond") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-gradient-to-r from-sky-200 via-indigo-100 to-violet-200 px-2 py-0.5 text-[11px] font-semibold text-slate-950 dark:border-indigo-900/40 dark:from-indigo-900/30 dark:via-indigo-900/10 dark:to-indigo-900/30 dark:text-slate-100">
        <span aria-hidden>💎</span>
        <span>Featured Diamond</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
      <span aria-hidden>★</span>
      <span>Featured Basic</span>
    </span>
  );
}

function UnverifiedPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
      <span aria-hidden>!</span>
      <span>Unverified</span>
    </span>
  );
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
  storeHref,
  donateSellerId,
  contactSlot,
  className,
}: SellerInfoProps) {
  const safeUsername = React.useMemo(() => cleanUsername(username ?? null), [username]);
  const safeSellerId = React.useMemo(() => cleanSellerId(sellerId ?? null), [sellerId]);
  const safeDonateId = React.useMemo(() => cleanSellerId(donateSellerId ?? null), [donateSellerId]);

  const safeName = (name?.trim() || safeUsername || "Seller").trim();

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
      className={cn("rounded-xl border border-border bg-card p-4", className)}
      data-seller-id={safeSellerId ? stripLeadingUPrefixes(safeSellerId) : undefined}
    >
      <h3 className="mb-3 font-semibold text-foreground">{label}</h3>

      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted text-sm font-semibold text-foreground ring-2 ring-background/80 ring-offset-2 ring-offset-white dark:ring-offset-slate-900">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {fallbackAvatarLetter(safeName)}
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2 text-sm text-foreground">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">{safeName}</span>

            {safeUsername ? (
              <span className="text-xs text-muted-foreground">@{safeUsername}</span>
            ) : null}

            {typeof verified === "boolean" ? (
              verified ? (
                <VerifiedBadge className="inline-flex" />
              ) : (
                <UnverifiedPill />
              )
            ) : null}

            {featuredTier ? <FeaturedTierPill tier={featuredTier} /> : null}
          </div>

          {locationLabel ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Location:</span> {locationLabel}
            </p>
          ) : null}

          {showMetaRow ? (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.75rem] text-muted-foreground">
              {typeof rating === "number" && rating > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                  <span aria-hidden>⭐</span>
                  <span className="font-medium">{rating.toFixed(1)}</span>
                  <span>rating</span>
                </span>
              ) : null}

              {typeof salesCount === "number" && salesCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                  <span aria-hidden>✓</span>
                  <span className="font-medium">{salesCount}</span>
                  <span>sales</span>
                </span>
              ) : null}

              {memberSince ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
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
                className="inline-flex items-center gap-1 text-xs font-medium text-brandBlue hover:underline"
                data-testid="seller-map-link"
              >
                <span aria-hidden>📍</span>
                <span>View on Google Maps</span>
              </a>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {contactSlot}

            {safeStoreHref ? (
              <Link
                href={safeStoreHref}
                prefetch={false}
                className="btn-outline"
                aria-label="Visit store"
                data-testid="visit-store-link"
              >
                Visit Store
              </Link>
            ) : null}

            {hasDonate ? <AnyDonateButton sellerId={stripLeadingUPrefixes(safeDonateId!)} /> : null}
          </div>

          <p className="mt-3 text-[0.7rem] leading-relaxed text-muted-foreground">
            Stay safe: meet in public places, verify details before paying, and report suspicious
            activity.
          </p>
        </div>
      </div>
    </section>
  );
}
