// src/app/store/[username]/page.tsx
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/app/lib/prisma";
import UserAvatar from "@/app/components/UserAvatar";
import SmartImage from "@/app/components/SmartImage";
import ReviewSummary from "@/app/components/ReviewSummary";
import ReviewStars from "@/app/components/ReviewStars";
import VerifiedBadge from "@/app/components/VerifiedBadge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/* ----------------------------- utils ----------------------------- */

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "Contact for price";
  try {
    return `KES ${new Intl.NumberFormat("en-KE", {
      maximumFractionDigits: 0,
    }).format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

function fmtServiceKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "Contact for quote";
  return fmtKES(n);
}

function normalizeStoreSlug(raw?: string) {
  let v = "";
  try {
    v = decodeURIComponent(String(raw ?? "")).trim();
  } catch {
    v = String(raw ?? "").trim();
  }
  return v.replace(/^@+/, "");
}

function cleanUsername(raw?: string) {
  const v = normalizeStoreSlug(raw);
  return /^[a-z0-9._-]{2,128}$/i.test(v) ? v : "";
}

function stripLeadingUPrefixes(v: string) {
  let cur = String(v || "").trim();
  for (let i = 0; i < 4; i++) {
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

/**
 * Only treat as an ID when:
 * - URL is explicitly /store/u-<id> (including u-u-... accidents), OR
 * - The slug looks like an actual id (uuid/hex/cuid-ish).
 */
function parseSellerId(raw?: string): string | null {
  const v0 = normalizeStoreSlug(raw);
  if (!v0) return null;

  const hadUPrefix = /^u-/i.test(v0);
  const tail = hadUPrefix ? stripLeadingUPrefixes(v0) : v0;

  if (!tail || isJunkToken(tail)) return null;
  if (tail.length > 120) return null;

  if (hadUPrefix) return tail;

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      tail,
    )
  )
    return tail; // uuid
  if (/^[0-9a-f]{24}$/i.test(tail)) return tail; // 24-hex
  if (/^[0-9a-f-]{32,36}$/i.test(tail)) return tail; // hex-ish with dashes
  if (/^c[0-9a-z]{20,}$/i.test(tail)) return tail; // cuid-ish

  return null;
}

function toFiniteNumberIfExactIntString(v: string): number | null {
  const s = String(v || "").trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Supports common store codes like:
 *   Sto-83535, sto_83535, store-83535, 83535
 */
function parseStoreNumericSuffix(slug: string): number | null {
  const s = String(slug || "").trim();
  if (!s) return null;

  const m = /^(?:sto|store)[-_]?(\d{1,18})$/i.exec(s);
  if (m?.[1]) return toFiniteNumberIfExactIntString(m[1]);

  if (/^\d{1,18}$/.test(s)) return toFiniteNumberIfExactIntString(s);

  return null;
}

async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let tid: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((resolve) => {
    tid = setTimeout(() => resolve(fallback), ms);
  });
  const result = await Promise.race([p.catch(() => fallback), timeout]);
  if (tid) clearTimeout(tid);
  return result;
}

type RatingSummary = { average: number | null; count: number };

function aggregateListingRatings(
  products: Array<{ ratingAverage?: number | null; ratingCount?: number | null }>,
  services: Array<{ ratingAverage?: number | null; ratingCount?: number | null }>,
): RatingSummary {
  let totalStars = 0;
  let totalCount = 0;

  for (const item of [...products, ...services]) {
    const avg =
      typeof item.ratingAverage === "number" && item.ratingAverage > 0
        ? item.ratingAverage
        : null;
    const count =
      typeof item.ratingCount === "number" && item.ratingCount > 0
        ? item.ratingCount
        : 0;
    if (avg != null && count > 0) {
      totalStars += avg * count;
      totalCount += count;
    }
  }

  if (!totalCount) return { average: null, count: 0 };
  return { average: totalStars / totalCount, count: totalCount };
}

function pickImage(val: any): string | null {
  if (!val) return null;
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    const first = val.find((x) => typeof x === "string" && x.trim());
    return typeof first === "string" ? first : null;
  }
  return null;
}

function safeIso(d: any): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  const dd = new Date(String(d));
  return Number.isFinite(dd.getTime()) ? dd.toISOString() : null;
}

/* ------------------------ seller badge helpers ------------------------ */

type FeaturedTier = "basic" | "gold" | "diamond";
type SellerBadgeInfo = { verified: boolean | null; tier: FeaturedTier | null };

function normalizeTier(v: unknown): FeaturedTier | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;

  // allow common forms while staying in union
  if (/\bdiamond\b/.test(s)) return "diamond";
  if (/\bgold\b/.test(s)) return "gold";
  if (/\bbasic\b/.test(s)) return "basic";

  return null;
}

function isValidDateLike(v: unknown): boolean {
  if (v instanceof Date) return Number.isFinite(v.getTime());
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return false;
    const lower = s.toLowerCase();
    if (lower === "null" || lower === "undefined" || lower === "nan") return false;
    const d = new Date(s);
    return Number.isFinite(d.getTime());
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 0) return false;
    const d = new Date(v);
    return Number.isFinite(d.getTime());
  }
  return false;
}

/**
 * ✅ Verification must be derived ONLY from emailVerified (or equivalent),
 * not from legacy boolean keys.
 *
 * - If the key exists but is null/empty => unverified (false)
 * - If the key does not exist at all => unknown (null)
 */
function pickVerifiedFromUserJson(u: any): boolean | null {
  if (!u || typeof u !== "object") return null;

  const keys = ["emailVerified", "email_verified", "emailVerifiedAt", "email_verified_at"];

  let sawAnyKey = false;

  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(u, k)) continue;
    sawAnyKey = true;

    const v = (u as any)[k];

    if (v == null) return false;

    if (typeof v === "boolean") return v;

    if (typeof v === "number") {
      if (v === 1) return true;
      if (v === 0) return false;
      return isValidDateLike(v);
    }

    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (!s || s === "null" || s === "undefined" || s === "nan") return false;
      if (["1", "true", "yes"].includes(s)) return true;
      if (["0", "false", "no"].includes(s)) return false;
      if (isValidDateLike(v)) return true;
      return false;
    }

    if (v instanceof Date) {
      return Number.isFinite(v.getTime());
    }

    return false;
  }

  return sawAnyKey ? false : null;
}

function pickTierFromUserJson(u: any): FeaturedTier | null {
  if (!u || typeof u !== "object") return null;

  const candidates: unknown[] = [
    // preferred: consolidated badges
    (u as any).sellerBadges?.tier,

    (u as any).featuredTier,
    (u as any).featured_tier,
    (u as any).sellerFeaturedTier,
    (u as any).seller_featured_tier,
    (u as any).accountFeaturedTier,
    (u as any).account_featured_tier,

    (u as any).subscriptionTier,
    (u as any).subscription_tier,
    (u as any).subscription,
    (u as any).plan,
    (u as any).tier,
  ];

  for (const c of candidates) {
    if (typeof c === "string" || typeof c === "number") {
      const t = normalizeTier(c);
      if (t) return t;
    }

    if (c && typeof c === "object") {
      const inner =
        (c as any).featuredTier ??
        (c as any).featured_tier ??
        (c as any).subscriptionTier ??
        (c as any).subscription_tier ??
        (c as any).tier ??
        (c as any).plan ??
        (c as any).name;
      if (typeof inner === "string" || typeof inner === "number") {
        const t = normalizeTier(inner);
        if (t) return t;
      }
    }
  }

  return null;
}

async function fetchSellerBadgeInfo(userId: string): Promise<SellerBadgeInfo> {
  try {
    const rows = await prisma.$queryRaw<{ u: any }[]>`
      SELECT row_to_json(u) as u
      FROM "User" u
      WHERE u.id = ${userId}
      LIMIT 1
    `;
    const u = rows?.[0]?.u;

    // Prefer DB-provided consolidated badges if present, otherwise derive via rules.
    const consolidated =
      u?.sellerBadges && typeof u.sellerBadges === "object" ? u.sellerBadges : null;

    const consolidatedVerified =
      consolidated && typeof consolidated.verified === "boolean"
        ? consolidated.verified
        : null;

    const consolidatedTier =
      consolidated && (typeof consolidated.tier === "string" || typeof consolidated.tier === "number")
        ? normalizeTier(consolidated.tier)
        : null;

    const verified = consolidatedVerified ?? pickVerifiedFromUserJson(u) ?? false;
    const tier = consolidatedTier ?? pickTierFromUserJson(u) ?? "basic";

    // Keep stable output for UI/tests on store pages.
    return { verified, tier };
  } catch {
    return { verified: false, tier: "basic" };
  }
}

function SellerBadges({
  info,
  showTier,
}: {
  info: SellerBadgeInfo;
  showTier: boolean;
}) {
  const verifiedProp =
    typeof info.verified === "boolean" ? { verified: info.verified } : {};
  const tierProp =
    showTier && info.tier ? { featuredTier: info.tier } : {};

  return (
    <VerifiedBadge
      {...verifiedProp}
      {...tierProp}
      // critical: do NOT let the component derive tier from legacy booleans
      featured={false}
    />
  );
}

/* ------------------------ NEW: listing pills (test-friendly) ------------------------ */

function ListingVerifiedPill({ verified }: { verified: boolean }) {
  return (
    <span
      data-testid={verified ? "verified-badge" : "unverified-badge"}
      aria-label={verified ? "Verified seller" : "Unverified seller"}
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        "sm:px-2.5 sm:py-1 sm:text-xs",
        "border-[var(--border-subtle)]",
        verified
          ? "bg-[var(--bg-subtle)] text-[var(--text)]"
          : "bg-[var(--bg)] text-[var(--text-muted)]",
      ].join(" ")}
    >
      <span className="text-[10px]" aria-hidden="true">
        {verified ? "✓" : "✕"}
      </span>
      <span>{verified ? "Verified" : "Unverified"}</span>
    </span>
  );
}

function ListingTierPill({ tier }: { tier: FeaturedTier }) {
  return (
    <span
      data-testid={`featured-tier-${tier}`}
      aria-label={`Featured ${tier}`}
      className={[
        "inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text)]",
        "sm:px-2.5 sm:py-1 sm:text-xs",
      ].join(" ")}
    >
      <span className="text-[10px]" aria-hidden="true">
        ★
      </span>
      <span>{tier}</span>
    </span>
  );
}

function ListingBadgeRow({ info }: { info: SellerBadgeInfo }) {
  const verified =
    typeof info.verified === "boolean" ? info.verified : null;
  const tier = info.tier ?? null;

  // Tests expect these to exist inside the <a>.
  // We keep output stable (your page defaults already make these non-null).
  if (verified == null && !tier) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {verified != null ? <ListingVerifiedPill verified={verified} /> : null}
      {tier ? <ListingTierPill tier={tier} /> : null}
    </div>
  );
}

/* ----------------------------- Metadata ----------------------------- */

type MetaUser = { id: any; username: string | null; name: string | null };
type MetaUserRow = MetaUser | null;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username: raw } = await params;

  const slug = normalizeStoreSlug(raw);
  const sellerIdFromUrl = parseSellerId(slug);
  const storeNumeric = parseStoreNumericSuffix(slug);

  const looksLikeUPath = /^u-/i.test(slug);
  const usernameFromUrl = looksLikeUPath ? "" : cleanUsername(slug);

  if (!usernameFromUrl && !sellerIdFromUrl && storeNumeric == null && !slug) {
    return {
      title: "Store | QwikSale",
      description: "Browse a seller’s listings on QwikSale.",
    };
  }

  try {
    const USER_LOOKUP_TIMEOUT_MS = 8000;

    let user: MetaUserRow = null;

    if (usernameFromUrl) {
      user = await withTimeout<MetaUserRow>(
        prisma.user.findFirst({
          where: { username: { equals: usernameFromUrl, mode: "insensitive" } },
          select: { id: true, username: true, name: true },
        }),
        USER_LOOKUP_TIMEOUT_MS,
        null,
      );
    }

    if (!user && sellerIdFromUrl) {
      user = await withTimeout<MetaUserRow>(
        prisma.user.findUnique({
          where: { id: sellerIdFromUrl },
          select: { id: true, username: true, name: true },
        }),
        USER_LOOKUP_TIMEOUT_MS,
        null,
      );
    }

    if (!user && slug) {
      user = await withTimeout<MetaUserRow>(
        prisma.user.findFirst({
          where: { referralCode: { equals: slug, mode: "insensitive" } },
          select: { id: true, username: true, name: true },
        }),
        USER_LOOKUP_TIMEOUT_MS,
        null,
      );
    }

    if (user) {
      const handle = user.username ? `@${user.username}` : `u-${String(user.id)}`;
      const display = user.name ? `${user.name} (${handle})` : handle;
      return {
        title: `${display} | Store | QwikSale`,
        description: `Browse listings from ${user.name || handle} on QwikSale.`,
      };
    }
  } catch {
    // ignore
  }

  const handle = usernameFromUrl
    ? `@${usernameFromUrl}`
    : storeNumeric != null
      ? `sto-${storeNumeric}`
      : sellerIdFromUrl
        ? `u-${sellerIdFromUrl}`
        : slug
          ? slug
          : "store";

  return {
    title: `${handle} | Store | QwikSale`,
    description: `Browse listings from ${handle} on QwikSale.`,
  };
}

/* ----------------------------- types ----------------------------- */

type StoreProduct = {
  id: string;
  name: string | null;
  image: string | null;
  price: number | null;
  featured: boolean | null;
  category: string | null;
  subcategory: string | null;
  createdAt?: string | null;
  ratingAverage?: number | null;
  ratingCount?: number | null;
  sellerId?: string | null;
};

type StoreService = StoreProduct;

type StoreUser = {
  id: any;
  name: string | null;
  username: string | null;
  image: string | null;
  city: string | null;
  country: string | null;
  createdAt: Date | null;
};

/* ----------------------------- store resolution ----------------------------- */

function pushSnapshotOr(list: any[], token: string) {
  const t = String(token || "").trim();
  if (!t) return;

  list.push({ sellerName: { equals: t, mode: "insensitive" as const } });
  list.push({ sellerMemberSince: { equals: t, mode: "insensitive" as const } });
  list.push({ sellerPhone: { equals: t, mode: "insensitive" as const } });
  list.push({ sellerLocation: { equals: t, mode: "insensitive" as const } });
}

async function resolveSellerIdFromSnapshots(
  tokenCandidates: string[],
  timeoutMs: number,
): Promise<string | null> {
  const ors: any[] = [];
  for (const t of tokenCandidates) pushSnapshotOr(ors, t);
  if (!ors.length) return null;

  const fromProduct = await withTimeout<string | null>(
    prisma.product
      .findFirst({
        where: {
          sellerId: { not: null },
          OR: ors,
        },
        select: { sellerId: true },
      })
      .then((r) => (r?.sellerId ? String(r.sellerId) : null))
      .catch(() => null),
    timeoutMs,
    null,
  );
  if (fromProduct) return fromProduct;

  const fromService = await withTimeout<string | null>(
    prisma.service
      .findFirst({
        where: {
          sellerId: { not: null },
          OR: ors,
        },
        select: { sellerId: true },
      })
      .then((r) => (r?.sellerId ? String(r.sellerId) : null))
      .catch(() => null),
    timeoutMs,
    null,
  );
  if (fromService) return fromService;

  return null;
}

/**
 * NEW: Resolve sellerId from store-code-ish tokens (e.g. "Sto-xxxxx") by scanning
 * Product/Service rows via JSON keys - avoids schema assumptions because missing keys just return NULL.
 */
async function resolveSellerIdFromListingTokenKeys(
  tokenCandidates: string[],
  timeoutMs: number,
): Promise<string | null> {
  const tokens = Array.from(
    new Set(
      (tokenCandidates || [])
        .map((t) => normalizeStoreSlug(t))
        .filter((t) => t && !isJunkToken(t) && String(t).length <= 120),
    ),
  );

  if (!tokens.length) return null;

  const tryProduct = async (token: string) => {
    const rows = await prisma.$queryRaw<{ sellerId: any }[]>`
      SELECT p."sellerId" as "sellerId"
      FROM "Product" p
      WHERE p."sellerId" IS NOT NULL
        AND (
          lower(coalesce(to_jsonb(p)->>'sellerUsername','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'seller_username','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'username','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'storeCode','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'store_code','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'sellerStoreCode','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'seller_store_code','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'storeSlug','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'store_slug','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'sellerStoreSlug','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'seller_store_slug','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'storeHandle','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'store_handle','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'sellerStoreHandle','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'seller_store_handle','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'storePath','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'store_path','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'store','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'shop','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'merchant','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'storefront','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'shopSlug','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'merchantSlug','')) = lower(${token})
          OR lower(coalesce(to_jsonb(p)->>'storefrontSlug','')) = lower(${token})
        )
      LIMIT 1
    `;
    const sid = rows?.[0]?.sellerId;
    return sid != null ? String(sid) : null;
  };

  const tryService = async (token: string) => {
    const rows = await prisma.$queryRaw<{ sellerId: any }[]>`
      SELECT s."sellerId" as "sellerId"
      FROM "Service" s
      WHERE s."sellerId" IS NOT NULL
        AND (
          lower(coalesce(to_jsonb(s)->>'sellerUsername','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'seller_username','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'username','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'storeCode','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'store_code','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'sellerStoreCode','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'seller_store_code','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'storeSlug','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'store_slug','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'sellerStoreSlug','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'seller_store_slug','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'storeHandle','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'store_handle','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'sellerStoreHandle','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'seller_store_handle','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'storePath','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'store_path','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'store','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'shop','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'merchant','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'storefront','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'shopSlug','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'merchantSlug','')) = lower(${token})
          OR lower(coalesce(to_jsonb(s)->>'storefrontSlug','')) = lower(${token})
        )
      LIMIT 1
    `;
    const sid = rows?.[0]?.sellerId;
    return sid != null ? String(sid) : null;
  };

  for (const token of tokens) {
    const fromProduct = await withTimeout<string | null>(
      tryProduct(token).catch(() => null),
      timeoutMs,
      null,
    );
    if (fromProduct) return fromProduct;

    const fromService = await withTimeout<string | null>(
      tryService(token).catch(() => null),
      timeoutMs,
      null,
    );
    if (fromService) return fromService;
  }

  return null;
}

/* ----------------------------- Page ----------------------------- */

export default async function StorePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: raw } = await params;

  const slug = normalizeStoreSlug(raw);
  const storeNumeric = parseStoreNumericSuffix(slug);

  const looksLikeUPath = /^u-/i.test(slug);
  const usernameFromUrl = looksLikeUPath ? "" : cleanUsername(slug);

  const sellerIdFromUrl = parseSellerId(slug);

  const USER_LOOKUP_TIMEOUT_MS = 8000;
  const COUNT_TIMEOUT_MS = 4500;
  const LISTINGS_TIMEOUT_MS = 14_000;

  const userSelect = {
    id: true,
    name: true,
    username: true,
    image: true,
    city: true,
    country: true,
    createdAt: true,
  } as const;

  const tokenCandidates = Array.from(
    new Set(
      [
        slug,
        storeNumeric != null ? `sto-${storeNumeric}` : "",
        storeNumeric != null ? `store-${storeNumeric}` : "",
      ].filter((x) => x && !isJunkToken(x) && String(x).length <= 120),
    ),
  );

  // 1) Try resolve seller via User by username / id / referralCode
  let realUser: StoreUser | null = null;

  if (usernameFromUrl) {
    realUser = await withTimeout<StoreUser | null>(
      prisma.user
        .findFirst({
          where: { username: { equals: usernameFromUrl, mode: "insensitive" } },
          select: userSelect,
        })
        .catch(() => null),
      USER_LOOKUP_TIMEOUT_MS,
      null,
    );
  }

  if (!realUser && sellerIdFromUrl) {
    realUser = await withTimeout<StoreUser | null>(
      prisma.user
        .findUnique({
          where: { id: sellerIdFromUrl },
          select: userSelect,
        })
        .catch(() => null),
      USER_LOOKUP_TIMEOUT_MS,
      null,
    );
  }

  if (!realUser && slug) {
    realUser = await withTimeout<StoreUser | null>(
      prisma.user
        .findFirst({
          where: { referralCode: { equals: slug, mode: "insensitive" } },
          select: userSelect,
        })
        .catch(() => null),
      USER_LOOKUP_TIMEOUT_MS,
      null,
    );
  }

  // 2) Resolve sellerId from listing token keys (handles Sto-xxxxx style slugs)
  let resolvedUserId: string | null = realUser?.id ? String(realUser.id) : null;

  if (!resolvedUserId && tokenCandidates.length) {
    const fromTokenKeys = await resolveSellerIdFromListingTokenKeys(
      tokenCandidates,
      USER_LOOKUP_TIMEOUT_MS,
    );
    if (fromTokenKeys) {
      resolvedUserId = fromTokenKeys;
      if (!realUser) {
        realUser = await withTimeout<StoreUser | null>(
          prisma.user
            .findUnique({
              where: { id: fromTokenKeys },
              select: userSelect,
            })
            .catch(() => null),
          USER_LOOKUP_TIMEOUT_MS,
          null,
        );
      }
    }
  }

  // 3) Legacy snapshot fallback (sellerName/phone/etc)
  if (!resolvedUserId && tokenCandidates.length) {
    const fromSnapshots = await resolveSellerIdFromSnapshots(
      tokenCandidates,
      USER_LOOKUP_TIMEOUT_MS,
    );
    if (fromSnapshots) {
      resolvedUserId = fromSnapshots;
      if (!realUser) {
        realUser = await withTimeout<StoreUser | null>(
          prisma.user
            .findUnique({
              where: { id: fromSnapshots },
              select: userSelect,
            })
            .catch(() => null),
          USER_LOOKUP_TIMEOUT_MS,
          null,
        );
      }
    }
  }

  const user: StoreUser =
    realUser || {
      id: null,
      name: null,
      username:
        usernameFromUrl ||
        slug ||
        (storeNumeric != null ? `sto-${storeNumeric}` : "unknown"),
      image: null,
      city: null,
      country: null,
      createdAt: null,
    };

  const shouldFetchListings =
    !!resolvedUserId ||
    tokenCandidates.length > 0 ||
    !!usernameFromUrl ||
    !!sellerIdFromUrl;

  const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
  const take = 48;

  let prodOk = true;
  let svcOk = true;

  let products: StoreProduct[] = [];
  let services: StoreService[] = [];

  let totalProducts = 0;
  let totalServices = 0;

  const statusActive: any = "ACTIVE";

  // Build a safe, schema-valid snapshot OR filter (only uses fields that exist in your schema)
  const snapshotOr: any[] = [];
  for (const t of tokenCandidates) pushSnapshotOr(snapshotOr, t);

  const productWhere =
    resolvedUserId != null
      ? ({ sellerId: resolvedUserId, status: statusActive } as any)
      : snapshotOr.length
        ? ({ status: statusActive, OR: snapshotOr } as any)
        : null;

  const serviceWhere =
    resolvedUserId != null
      ? ({ sellerId: resolvedUserId, status: statusActive } as any)
      : snapshotOr.length
        ? ({ status: statusActive, OR: snapshotOr } as any)
        : null;

  if (shouldFetchListings) {
    const [pCount, sCount] = await Promise.all([
      productWhere
        ? withTimeout<number | null>(
            prisma.product
              .count({ where: productWhere })
              .then((n) => (typeof n === "number" ? n : 0))
              .catch(() => null),
            COUNT_TIMEOUT_MS,
            null,
          )
        : Promise.resolve(0),
      serviceWhere
        ? withTimeout<number | null>(
            prisma.service
              .count({ where: serviceWhere })
              .then((n) => (typeof n === "number" ? n : 0))
              .catch(() => null),
            COUNT_TIMEOUT_MS,
            null,
          )
        : Promise.resolve(0),
    ]);

    totalProducts = typeof pCount === "number" ? pCount : 0;
    totalServices = typeof sCount === "number" ? sCount : 0;

    if (pCount == null) prodOk = false;
    if (sCount == null) svcOk = false;

    const [pRows, sRows] = await Promise.all([
      productWhere
        ? withTimeout<any[] | null>(
            prisma.product
              .findMany({ where: productWhere, orderBy, take })
              .then((x: any) => (Array.isArray(x) ? x : []))
              .catch(() => null),
            LISTINGS_TIMEOUT_MS,
            null,
          )
        : Promise.resolve([]),
      serviceWhere
        ? withTimeout<any[] | null>(
            prisma.service
              .findMany({ where: serviceWhere, orderBy, take })
              .then((x: any) => (Array.isArray(x) ? x : []))
              .catch(() => null),
            LISTINGS_TIMEOUT_MS,
            null,
          )
        : Promise.resolve([]),
    ]);

    if (pRows == null) prodOk = false;
    if (sRows == null) svcOk = false;

    const safePRows = Array.isArray(pRows) ? pRows : [];
    const safeSRows = Array.isArray(sRows) ? sRows : [];

    products = safePRows.map((p: any) => ({
      id: String(p.id),
      name: p.name ?? null,
      image: pickImage(p.image),
      price:
        typeof p.price === "number"
          ? p.price
          : p.price == null
            ? null
            : Number(p.price) || null,
      featured: typeof p.featured === "boolean" ? p.featured : null,
      category: p.category ?? null,
      subcategory: p.subcategory ?? null,
      createdAt: safeIso(p.createdAt),
      ratingAverage: typeof p.ratingAverage === "number" ? p.ratingAverage : null,
      ratingCount: typeof p.ratingCount === "number" ? p.ratingCount : null,
      sellerId: p.sellerId != null ? String(p.sellerId) : null,
    }));

    services = safeSRows.map((s: any) => ({
      id: String(s.id),
      name: s.name ?? null,
      image: pickImage(s.image),
      price:
        typeof s.price === "number"
          ? s.price
          : s.price == null
            ? null
            : Number(s.price) || null,
      featured: typeof s.featured === "boolean" ? s.featured : null,
      category: s.category ?? null,
      subcategory: s.subcategory ?? null,
      createdAt: safeIso(s.createdAt),
      ratingAverage: typeof s.ratingAverage === "number" ? s.ratingAverage : null,
      ratingCount: typeof s.ratingCount === "number" ? s.ratingCount : null,
      sellerId: s.sellerId != null ? String(s.sellerId) : null,
    }));

    if (!resolvedUserId) {
      const sid =
        products.find((x) => x.sellerId)?.sellerId ||
        services.find((x) => x.sellerId)?.sellerId ||
        null;
      if (sid) resolvedUserId = sid;
    }

    if (!totalProducts && products.length) totalProducts = products.length;
    if (!totalServices && services.length) totalServices = services.length;
  }

  const totalListings =
    (totalProducts || products.length) + (totalServices || services.length);
  const hasAny = products.length + services.length > 0;

  let sellerBadges: SellerBadgeInfo | null = resolvedUserId
    ? await fetchSellerBadgeInfo(String(resolvedUserId))
    : null;

  if (!sellerBadges) {
    const sid =
      products.find((x) => x.sellerId)?.sellerId ||
      services.find((x) => x.sellerId)?.sellerId ||
      null;
    if (sid) sellerBadges = await fetchSellerBadgeInfo(String(sid));
  }

  // Stable display: if we can’t resolve, default to Unverified + Featured basic
  const sellerBadgesFinal: SellerBadgeInfo = sellerBadges ?? {
    verified: false,
    tier: "basic",
  };

  const storeRating: RatingSummary = shouldFetchListings
    ? aggregateListingRatings(products, services)
    : { average: null, count: 0 };

  const memberSinceYear =
    user.createdAt instanceof Date
      ? user.createdAt.getFullYear()
      : user.createdAt
        ? new Date(user.createdAt).getFullYear()
        : null;

  const hasStoreRating =
    typeof storeRating.average === "number" && storeRating.count > 0;

  const displayHandle =
    user.username ||
    (resolvedUserId
      ? `u-${String(resolvedUserId)}`
      : storeNumeric != null
        ? `sto-${storeNumeric}`
        : sellerIdFromUrl
          ? `u-${sellerIdFromUrl}`
          : slug || "unknown");

  // Overlay tier (never derived from listing.featured; only controls *visibility*)
  const sellerTierForOverlay: FeaturedTier =
    (sellerBadgesFinal.tier ?? "basic") as FeaturedTier;

  return (
    <main
      id="main"
      className="min-h-[calc(100vh-4rem)] bg-[var(--bg)] px-4 py-4 text-[var(--text)] sm:py-6 md:px-8 lg:px-12 xl:px-16"
    >
      <section className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6">
        {/* Store hero (Dashboard-style) */}
        <header
          aria-label="Store header"
          className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-gradient-to-r from-[#161748] via-[#478559] to-[#39a0ca] text-white shadow-soft"
        >
          {/* soft spotlight overlay */}
          <div
            className="pointer-events-none absolute inset-0 opacity-60 mix-blend-soft-light"
            aria-hidden="true"
          >
            <div className="h-full w-full bg-[var(--bg-subtle)]" />
          </div>

          <div className="container-page py-5 text-white sm:py-8">
            <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <UserAvatar
                  src={user.image}
                  alt={`${displayHandle} avatar`}
                  size={56}
                  ring
                  fallbackText={(user.name || displayHandle || "U")
                    .slice(0, 1)
                    .toUpperCase()}
                />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70 sm:text-xs sm:tracking-[0.25em]">
                    Storefront
                  </p>

                  <h1 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl md:text-3xl">
                    Store: <span className="text-white/95">@{displayHandle}</span>
                  </h1>

                  <p className="mt-1 text-[11px] leading-relaxed text-white/80 sm:text-sm">
                    {user.name ? `${user.name}` : "Store profile"}
                    {memberSinceYear ? ` • Member since ${memberSinceYear}` : ""}
                    {user.city || user.country
                      ? ` • ${[user.city, user.country].filter(Boolean).join(", ")}`
                      : ""}
                  </p>

                  {/* ✅ Canonical: a single badge component in the store header */}
                  <div className="mt-2 sm:mt-3">
                    <SellerBadges info={sellerBadgesFinal} showTier />
                  </div>

                  {resolvedUserId != null && hasStoreRating && (
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-white/80 sm:mt-3 sm:text-xs">
                      <ReviewSummary
                        listingId={String(resolvedUserId)}
                        listingType="seller"
                        average={storeRating.average}
                        count={storeRating.count}
                        size="sm"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex w-full flex-col items-start gap-2 md:w-auto md:items-end md:gap-3">
                {totalListings > 0 && (
                  <div className="inline-flex flex-wrap items-center gap-2 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-sm sm:px-3 sm:py-1 sm:text-xs">
                    <span>
                      {totalListings.toLocaleString()}{" "}
                      {totalListings === 1 ? "listing" : "listings"}
                    </span>
                    {totalProducts > 0 && (
                      <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5">
                        {totalProducts} products
                      </span>
                    )}
                    {totalServices > 0 && (
                      <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5">
                        {totalServices} services
                      </span>
                    )}
                  </div>
                )}

                <Link
                  href="/"
                  prefetch={false}
                  className="btn-outline bg-white/10 text-xs text-white hover:bg-white/15 active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:text-sm"
                >
                  Back to Home
                </Link>
              </div>
            </div>
          </div>
        </header>

        {shouldFetchListings && (!prodOk || !svcOk) && (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 text-sm text-[var(--text)] shadow-sm sm:p-4 md:p-5">
            <p className="font-semibold">Some listings couldn’t be loaded.</p>
            <p className="mt-1 opacity-80">
              {!prodOk && "Product listings are temporarily unavailable. "}
              {!svcOk && "Service listings are temporarily unavailable. "}
              Please try again later.
            </p>
          </div>
        )}

        {!hasAny && (
          <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-6 text-center shadow-sm sm:p-8">
            <p className="text-base font-extrabold tracking-tight text-[var(--text)] sm:text-lg">
              No listings yet
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
              {shouldFetchListings
                ? "This store hasn’t posted any products or services yet."
                : "This store profile isn’t set up yet."}
            </p>
            <div className="mt-3 sm:mt-4">
              <Link
                href="/"
                prefetch={false}
                className="btn-outline active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus"
              >
                Browse Home
              </Link>
            </div>
          </div>
        )}

        {products.length > 0 && (
          <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-sm sm:p-4 md:p-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold tracking-tight text-[var(--text)] sm:text-lg">
                  Products
                </h2>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)] sm:text-xs">
                  Browse what this store is selling right now.
                </p>
              </div>
              <span className="text-xs text-[var(--text-muted)] sm:text-sm">
                {totalProducts.toLocaleString()} items
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:mt-4 sm:gap-4 md:grid-cols-3 md:gap-6 xl:grid-cols-4">
              {products.map((p) => {
                const hasRating =
                  typeof p.ratingAverage === "number" &&
                  p.ratingAverage > 0 &&
                  typeof p.ratingCount === "number" &&
                  p.ratingCount > 0;

                return (
                  <Link
                    key={p.id}
                    href={`/product/${encodeURIComponent(p.id)}`}
                    prefetch={false}
                    className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 ring-focus active:scale-[.99]"
                    aria-label={p.name || "Product"}
                  >
                    <div
                      className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft"
                      data-listing-id={p.id}
                      data-listing-kind="product"
                      {...(hasRating
                        ? {
                            "data-rating-avg": p.ratingAverage ?? undefined,
                            "data-rating-count": p.ratingCount ?? undefined,
                          }
                        : {})}
                    >
                      {/* ✅ Featured overlay: single canonical badge component (tier only) */}
                      {p.featured && (
                        <div className="absolute left-1.5 top-1.5 z-10 sm:left-2 sm:top-2">
                          <VerifiedBadge
                            featured={false}
                            featuredTier={sellerTierForOverlay}
                          />
                        </div>
                      )}

                      <div className="relative h-36 w-full bg-[var(--bg-subtle)] sm:h-44">
                        <SmartImage
                          src={p.image || undefined}
                          alt={p.name || "Product image"}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      </div>

                      <div className="p-2.5 sm:p-3 md:p-4">
                        <h3 className="line-clamp-1 text-sm font-semibold text-[var(--text)] sm:text-base">
                          {p.name || "Unnamed item"}
                        </h3>
                        <p className="line-clamp-1 text-[11px] leading-relaxed text-[var(--text-muted)] sm:text-xs">
                          {[p.category, p.subcategory].filter(Boolean).join(" • ") ||
                            "-"}
                        </p>

                        {/* ✅ TEST REQUIREMENT: badges must be INSIDE the <a> */}
                        <ListingBadgeRow info={sellerBadgesFinal} />

                        <p className="mt-1.5 text-sm font-extrabold text-[var(--text)] sm:mt-2 sm:text-base sm:font-semibold">
                          {fmtKES(p.price)}
                        </p>

                        {hasRating && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                            <ReviewStars rating={p.ratingAverage || 0} />
                            <span className="font-medium text-[var(--text)]">
                              {p.ratingAverage?.toFixed(1)}
                            </span>
                            <span className="text-[0.7rem] text-[var(--text-muted)]">
                              ({p.ratingCount})
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {services.length > 0 && (
          <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-sm sm:p-4 md:p-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold tracking-tight text-[var(--text)] sm:text-lg">
                  Services
                </h2>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)] sm:text-xs">
                  Browse what this store offers as a service.
                </p>
              </div>
              <span className="text-xs text-[var(--text-muted)] sm:text-sm">
                {totalServices.toLocaleString()} items
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:mt-4 sm:gap-4 md:grid-cols-3 md:gap-6 xl:grid-cols-4">
              {services.map((s) => {
                const hasRating =
                  typeof s.ratingAverage === "number" &&
                  s.ratingAverage > 0 &&
                  typeof s.ratingCount === "number" &&
                  s.ratingCount > 0;

                return (
                  <Link
                    key={s.id}
                    href={`/service/${encodeURIComponent(s.id)}`}
                    prefetch={false}
                    className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 ring-focus active:scale-[.99]"
                    aria-label={s.name || "Service"}
                  >
                    <div
                      className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft"
                      data-listing-id={s.id}
                      data-listing-kind="service"
                      {...(hasRating
                        ? {
                            "data-rating-avg": s.ratingAverage ?? undefined,
                            "data-rating-count": s.ratingCount ?? undefined,
                          }
                        : {})}
                    >
                      {/* ✅ Featured overlay: single canonical badge component (tier only) */}
                      {s.featured && (
                        <div className="absolute left-1.5 top-1.5 z-10 sm:left-2 sm:top-2">
                          <VerifiedBadge
                            featured={false}
                            featuredTier={sellerTierForOverlay}
                          />
                        </div>
                      )}

                      <div className="relative h-36 w-full bg-[var(--bg-subtle)] sm:h-44">
                        <SmartImage
                          src={s.image || undefined}
                          alt={s.name || "Service image"}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      </div>

                      <div className="p-2.5 sm:p-3 md:p-4">
                        <h3 className="line-clamp-1 text-sm font-semibold text-[var(--text)] sm:text-base">
                          {s.name || "Unnamed service"}
                        </h3>
                        <p className="line-clamp-1 text-[11px] leading-relaxed text-[var(--text-muted)] sm:text-xs">
                          {[s.category, s.subcategory].filter(Boolean).join(" • ") ||
                            "-"}
                        </p>

                        {/* ✅ TEST REQUIREMENT: badges must be INSIDE the <a> */}
                        <ListingBadgeRow info={sellerBadgesFinal} />

                        <p className="mt-1.5 text-sm font-extrabold text-[var(--text)] sm:mt-2 sm:text-base sm:font-semibold">
                          {fmtServiceKES(s.price)}
                        </p>

                        {hasRating && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                            <ReviewStars rating={s.ratingAverage || 0} />
                            <span className="font-medium text-[var(--text)]">
                              {s.ratingAverage?.toFixed(1)}
                            </span>
                            <span className="text-[0.7rem] text-[var(--text-muted)]">
                              ({s.ratingCount})
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
