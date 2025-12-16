// src/app/store/[username]/page.tsx

import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/app/lib/prisma";
import UserAvatar from "@/app/components/UserAvatar";
import SmartImage from "@/app/components/SmartImage";
import ReviewSummary from "@/app/components/ReviewSummary";
import ReviewStars from "@/app/components/ReviewStars";

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

type SellerTier = "basic" | "gold" | "diamond";
type SellerBadgeInfo = { verified: boolean; tier: SellerTier };

function normalizeTier(v: unknown): SellerTier {
  const t = String(v ?? "").trim().toLowerCase();
  if (t.includes("diamond")) return "diamond";
  if (t.includes("gold")) return "gold";
  return "basic";
}

function pickVerifiedFromUserJson(u: any): boolean | null {
  if (!u || typeof u !== "object") return null;
  const keys = [
    "verified",
    "isVerified",
    "accountVerified",
    "sellerVerified",
    "isSellerVerified",
    "verifiedSeller",
    "isAccountVerified",
  ];
  for (const k of keys) {
    const v = (u as any)[k];
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (["1", "true", "yes", "verified"].includes(s)) return true;
      if (["0", "false", "no", "unverified"].includes(s)) return false;
    }
  }
  return null;
}

function pickTierFromUserJson(u: any): SellerTier {
  if (!u || typeof u !== "object") return "basic";
  const v =
    (u as any).featuredTier ??
    (u as any).subscriptionTier ??
    (u as any).subscription ??
    (u as any).plan ??
    (u as any).tier;
  return normalizeTier(v);
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
    const verified = pickVerifiedFromUserJson(u);
    const tier = pickTierFromUserJson(u);
    return { verified: verified ?? false, tier };
  } catch {
    return { verified: false, tier: "basic" };
  }
}

function VerifiedPill({ verified }: { verified: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        verified
          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200"
          : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200",
      ].join(" ")}
      aria-label={verified ? "Verified seller" : "Unverified seller"}
    >
      <span className="text-[10px]" aria-hidden="true">
        {verified ? "✓" : "!"}
      </span>
      <span>{verified ? "Verified" : "Unverified"}</span>
    </span>
  );
}

function TierPill({ tier }: { tier: SellerTier }) {
  const base =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold";

  if (tier === "gold") {
    return (
      <span
        className={`${base} border-yellow-300 bg-gradient-to-r from-yellow-200 via-yellow-100 to-yellow-300 text-yellow-950 dark:border-yellow-900/40 dark:from-yellow-900/30 dark:via-yellow-900/10 dark:to-yellow-900/30 dark:text-yellow-100`}
        aria-label="Featured tier gold"
      >
        <span className="text-[10px]" aria-hidden="true">
          ★
        </span>
        <span>Featured Gold</span>
      </span>
    );
  }

  if (tier === "diamond") {
    return (
      <span
        className={`${base} border-indigo-300 bg-gradient-to-r from-sky-200 via-indigo-100 to-violet-200 text-slate-950 dark:border-indigo-900/40 dark:from-indigo-900/30 dark:via-indigo-900/10 dark:to-indigo-900/30 dark:text-slate-100`}
        aria-label="Featured tier diamond"
      >
        <span className="text-[10px]" aria-hidden="true">
          💎
        </span>
        <span>Featured Diamond</span>
      </span>
    );
  }

  return (
    <span
      className={`${base} border-border bg-muted text-foreground`}
      aria-label="Featured tier basic"
    >
      <span className="text-[10px]" aria-hidden="true">
        ★
      </span>
      <span>Featured Basic</span>
    </span>
  );
}

function SellerBadgesInline({ info }: { info: SellerBadgeInfo }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <VerifiedPill verified={info.verified} />
      <TierPill tier={info.tier} />
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
 * NEW: Resolve sellerId from store-code-ish tokens (e.g. "Sto-83535") by scanning
 * Product/Service rows via JSON keys — avoids schema assumptions because missing keys just return NULL.
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

    // If we still couldn’t resolve a sellerId, but listings returned with sellerId populated,
    // lock the page to that sellerId (this also enables badges).
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

  // Last fallback for badges if we have a sellerId on any row
  if (!sellerBadges) {
    const sid =
      products.find((x) => x.sellerId)?.sellerId ||
      services.find((x) => x.sellerId)?.sellerId ||
      null;
    if (sid) sellerBadges = await fetchSellerBadgeInfo(String(sid));
  }

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

  return (
    <main
      id="main"
      className="min-h-[calc(100vh-4rem)] px-4 py-6 md:px-8 lg:px-12 xl:px-16"
    >
      <section className="mx-auto flex max-w-6xl flex-col gap-6">
        {/* Store hero (Dashboard-style) */}
        <header
          aria-label="Store header"
          className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-[#161748] via-[#1b244f] to-[#39a0ca] p-6 text-primary-foreground shadow-xl shadow-black/40"
        >
          {/* soft spotlight overlay (same vibe as dashboard) */}
          <div
            className="pointer-events-none absolute inset-0 opacity-60 mix-blend-soft-light"
            aria-hidden="true"
          >
            <div className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.16),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(71,133,89,0.3),_transparent_55%)]" />
          </div>

          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
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
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-200/80">
                  Storefront
                </p>

                <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
                  Store:{" "}
                  <span className="bg-gradient-to-r from-sky-300 to-emerald-300 bg-clip-text text-transparent">
                    @{displayHandle}
                  </span>
                </h1>

                <p className="mt-1 text-sm text-slate-100/80">
                  {user.name ? `${user.name}` : "Store profile"}
                  {memberSinceYear ? ` • Member since ${memberSinceYear}` : ""}
                  {user.city || user.country
                    ? ` • ${[user.city, user.country].filter(Boolean).join(", ")}`
                    : ""}
                </p>

                {sellerBadges && (
                  <div className="mt-3">
                    <SellerBadgesInline info={sellerBadges} />
                  </div>
                )}

                {resolvedUserId != null && hasStoreRating && (
                  <div className="mt-3 flex items-center gap-3 text-xs">
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

            <div className="flex w-full flex-col items-start gap-3 md:w-auto md:items-end">
              {totalListings > 0 && (
                <div className="inline-flex flex-wrap items-center gap-2 rounded-full bg-black/20 px-3 py-1 text-xs font-medium text-slate-50 backdrop-blur-sm">
                  <span>
                    {totalListings.toLocaleString()}{" "}
                    {totalListings === 1 ? "listing" : "listings"}
                  </span>
                  {totalProducts > 0 && (
                    <span className="inline-flex items-center rounded-full bg-black/20 px-2 py-0.5">
                      {totalProducts} products
                    </span>
                  )}
                  {totalServices > 0 && (
                    <span className="inline-flex items-center rounded-full bg-black/20 px-2 py-0.5">
                      {totalServices} services
                    </span>
                  )}
                </div>
              )}

              <Link
                href="/"
                prefetch={false}
                className="btn-outline bg-black/20 text-primary-foreground hover:bg-black/30"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </header>

        {shouldFetchListings && (!prodOk || !svcOk) && (
          <div className="rounded-3xl border border-amber-300/60 bg-amber-50/70 p-4 text-sm text-amber-950 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-50 md:p-5">
            <p className="font-semibold">Some listings couldn’t be loaded.</p>
            <p className="mt-1 opacity-80">
              {!prodOk && "Product listings are temporarily unavailable. "}
              {!svcOk && "Service listings are temporarily unavailable. "}
              Please try again later.
            </p>
          </div>
        )}

        {!hasAny && (
          <div className="rounded-3xl border border-dashed border-border/60 bg-muted/40 p-8 text-center shadow-sm">
            <p className="text-lg font-semibold text-foreground">
              No listings yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {shouldFetchListings
                ? "This store hasn’t posted any products or services yet."
                : "This store profile isn’t set up yet."}
            </p>
            <div className="mt-4">
              <Link href="/" prefetch={false} className="btn-outline">
                Browse Home
              </Link>
            </div>
          </div>
        )}

        {products.length > 0 && (
          <section className="rounded-3xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur-sm md:p-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Products
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Browse what this store is selling right now.
                </p>
              </div>
              <span className="text-sm text-muted-foreground">
                {totalProducts.toLocaleString()} items
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                    className="group"
                    aria-label={p.name || "Product"}
                  >
                    <div
                      className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                      data-listing-id={p.id}
                      data-listing-kind="product"
                      {...(hasRating
                        ? {
                            "data-rating-avg": p.ratingAverage ?? undefined,
                            "data-rating-count": p.ratingCount ?? undefined,
                          }
                        : {})}
                    >
                      {p.featured && (
                        <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748]/90 px-2 py-1 text-xs font-semibold text-primary-foreground shadow">
                          Featured
                        </span>
                      )}

                      <div className="relative h-40 w-full bg-muted">
                        <SmartImage
                          src={p.image || undefined}
                          alt={p.name || "Product image"}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      </div>

                      <div className="p-4">
                        <h3 className="line-clamp-1 font-semibold text-foreground">
                          {p.name || "Unnamed item"}
                        </h3>
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {[p.category, p.subcategory].filter(Boolean).join(" • ") ||
                            "—"}
                        </p>

                        {sellerBadges && (
                          <div className="mt-2">
                            <SellerBadgesInline info={sellerBadges} />
                          </div>
                        )}

                        <p className="mt-2 text-sm font-semibold text-[#39a0ca]">
                          {fmtKES(p.price)}
                        </p>

                        {hasRating && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <ReviewStars rating={p.ratingAverage || 0} />
                            <span className="font-medium">
                              {p.ratingAverage?.toFixed(1)}
                            </span>
                            <span className="text-[0.7rem] text-muted-foreground">
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
          <section className="rounded-3xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur-sm md:p-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Services
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Browse what this store offers as a service.
                </p>
              </div>
              <span className="text-sm text-muted-foreground">
                {totalServices.toLocaleString()} items
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                    className="group"
                    aria-label={s.name || "Service"}
                  >
                    <div
                      className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                      data-listing-id={s.id}
                      data-listing-kind="service"
                      {...(hasRating
                        ? {
                            "data-rating-avg": s.ratingAverage ?? undefined,
                            "data-rating-count": s.ratingCount ?? undefined,
                          }
                        : {})}
                    >
                      {s.featured && (
                        <span className="absolute left-2 top-2 z-10 rounded-md bg-[#161748]/90 px-2 py-1 text-xs font-semibold text-primary-foreground shadow">
                          Featured
                        </span>
                      )}

                      <div className="relative h-40 w-full bg-muted">
                        <SmartImage
                          src={s.image || undefined}
                          alt={s.name || "Service image"}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      </div>

                      <div className="p-4">
                        <h3 className="line-clamp-1 font-semibold text-foreground">
                          {s.name || "Unnamed service"}
                        </h3>
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {[s.category, s.subcategory].filter(Boolean).join(" • ") ||
                            "—"}
                        </p>

                        {sellerBadges && (
                          <div className="mt-2">
                            <SellerBadgesInline info={sellerBadges} />
                          </div>
                        )}

                        <p className="mt-2 text-sm font-semibold text-[#39a0ca]">
                          {fmtServiceKES(s.price)}
                        </p>

                        {hasRating && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <ReviewStars rating={s.ratingAverage || 0} />
                            <span className="font-medium">
                              {s.ratingAverage?.toFixed(1)}
                            </span>
                            <span className="text-[0.7rem] text-muted-foreground">
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
