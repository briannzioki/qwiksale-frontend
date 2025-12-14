// src/app/lib/dashboard.ts

/**
 * Shared types + helpers for the seller dashboard:
 * - Listing metrics (products + services)
 * - Inbox summary (conversations, unread, recent threads)
 * - Recent listings list for the dashboard page
 */

export type DashboardListing = {
  type: "product" | "service";
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  price: number | null;
  image: string | null;
  location: string | null;
  createdAt: string; // ISO string
};

export type SellerDashboardMetrics = {
  /** Total listings = products + services */
  myListingsCount: number;
  productsCount: number;
  servicesCount: number;

  /** New listings in the last N days (default 7) */
  newLast7Days: number;
  newProductsLast7Days: number;
  newServicesLast7Days: number;

  /** TODO: wire when we have likes/favorites tables */
  favoritesCount: number;
  likesOnMyListings: number;
};

export type SellerInboxThreadPreview = {
  id: string;
  listingId: string;
  listingType: "product" | "service";
  counterpartName: string;
  counterpartUsername: string | null;
  counterpartImage: string | null;
  lastMessageAt: string; // ISO
  unread: boolean;
  messagesCount: number;
};

export type DailyCountPoint = {
  date: string; // YYYY-MM-DD
  count: number;
};

export type SellerInboxSummary = {
  totalThreads: number;
  unreadThreads: number;
  newMessagesLast7Days: number;
  recentThreads: SellerInboxThreadPreview[];
  /** Per-day message counts over the recent window (for charts). */
  dailyMessageCounts: DailyCountPoint[];
};

export type SellerDashboardSummary = {
  metrics: SellerDashboardMetrics;
  inbox: SellerInboxSummary;
  recentListings: DashboardListing[];
};

const DEFAULT_RECENT_LISTINGS_LIMIT = 6;
const DEFAULT_RECENT_WINDOW_DAYS = 7;

export const EMPTY_INBOX_SUMMARY: SellerInboxSummary = {
  totalThreads: 0,
  unreadThreads: 0,
  newMessagesLast7Days: 0,
  recentThreads: [],
  dailyMessageCounts: [],
};

export function fmtInt(n: number): string {
  const val = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat("en-KE").format(val);
  } catch {
    return String(val);
  }
}

function toIso(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const s = String(value);
  const ts = Date.parse(s);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : "";
}

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value);
  const ts = Date.parse(s);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts);
}

function getServiceModel(prisma: any) {
  // Support both `service` and `services` model names defensively
  return prisma.service ?? prisma.services ?? null;
}

async function getPrisma() {
  const mod = await import("@/app/lib/prisma");
  return mod.prisma as any;
}

/**
 * Core listing metrics for a seller.
 * This only uses the Product + Service models and does not hit any HTTP APIs.
 */
export async function getSellerDashboardMetrics(
  userId: string,
): Promise<SellerDashboardMetrics> {
  if (!userId) throw new Error("userId is required for metrics");

  const prisma = await getPrisma();
  const ServiceModel = getServiceModel(prisma);

  const now = new Date();
  const since = new Date(
    now.getTime() - DEFAULT_RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const [
    productsCount,
    servicesCount,
    newProductsLast7Days,
    newServicesLast7Days,
  ] = await Promise.all([
    prisma.product.count({ where: { sellerId: userId } }),
    ServiceModel
      ? ServiceModel.count({ where: { sellerId: userId } })
      : Promise.resolve(0),
    prisma.product.count({
      where: { sellerId: userId, createdAt: { gte: since } },
    }),
    ServiceModel
      ? ServiceModel.count({
          where: { sellerId: userId, createdAt: { gte: since } },
        })
      : Promise.resolve(0),
  ]);

  const myListingsCount = productsCount + servicesCount;
  const newLast7Days = newProductsLast7Days + newServicesLast7Days;

  // favoritesCount / likesOnMyListings are placeholders for now.
  return {
    myListingsCount,
    productsCount,
    servicesCount,
    newLast7Days,
    newProductsLast7Days,
    newServicesLast7Days,
    favoritesCount: 0,
    likesOnMyListings: 0,
  };
}

/**
 * Combined "recent listings" list for the seller's dashboard.
 * Returns the last N products + services, merged and sorted by createdAt desc.
 */
export async function getSellerRecentListings(
  userId: string,
  opts?: { limit?: number; windowDays?: number },
): Promise<DashboardListing[]> {
  if (!userId) throw new Error("userId is required for recent listings");

  const prisma = await getPrisma();
  const ServiceModel = getServiceModel(prisma);

  const limit = Math.max(1, opts?.limit ?? DEFAULT_RECENT_LISTINGS_LIMIT);

  const now = new Date();
  const windowDays =
    typeof opts?.windowDays === "number"
      ? Math.max(1, opts.windowDays)
      : DEFAULT_RECENT_WINDOW_DAYS;
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const [productsRaw, servicesRaw] = await Promise.all([
    prisma.product.findMany({
      where: { sellerId: userId },
      select: {
        id: true,
        name: true,
        category: true,
        subcategory: true,
        price: true,
        image: true,
        location: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    ServiceModel
      ? ServiceModel.findMany({
          where: { sellerId: userId },
          select: {
            id: true,
            name: true,
            category: true,
            subcategory: true,
            price: true,
            image: true,
            location: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : Promise.resolve([]),
  ]);

  const items: DashboardListing[] = [
    ...productsRaw.map((p: any): DashboardListing => ({
      type: "product",
      id: String(p.id),
      name: p.name || "Untitled",
      category: p.category ?? null,
      subcategory: p.subcategory ?? null,
      price: typeof p.price === "number" ? p.price : null,
      image: p.image ?? null,
      location: p.location ?? null,
      createdAt: toIso(p.createdAt),
    })),
    ...servicesRaw.map((s: any): DashboardListing => ({
      type: "service",
      id: String(s.id),
      name: s.name || "Untitled",
      category: s.category ?? null,
      subcategory: s.subcategory ?? null,
      price: typeof s.price === "number" ? s.price : null,
      image: s.image ?? null,
      location: s.location ?? null,
      createdAt: toIso(s.createdAt),
    })),
  ];

  items.sort((a, b) => {
    const da = Date.parse(a.createdAt || "");
    const db = Date.parse(b.createdAt || "");
    if (db !== da) return db - da;
    return `${b.type}-${b.id}`.localeCompare(`${a.type}-${a.id}`);
  });

  return items.slice(0, limit);
}

/**
 * Inbox aggregation for the dashboard.
 * Uses the existing /api/messages endpoint (same one as MessagesClient),
 * then filters + normalizes it for the currently logged-in user.
 */
export async function getSellerInboxSummary(
  userId: string,
): Promise<SellerInboxSummary> {
  if (!userId) throw new Error("userId is required for inbox summary");

  try {
    const res = await fetch("/api/messages", {
      method: "GET",
      cache: "no-store",
      headers: { accept: "application/json" },
    });

    if (!res.ok) {
      return EMPTY_INBOX_SUMMARY;
    }

    const json: any = await res.json().catch(() => null);
    const rawItems: any[] = Array.isArray(json?.items) ? json.items : [];
    if (rawItems.length === 0) {
      return EMPTY_INBOX_SUMMARY;
    }

    const now = new Date();
    const since = new Date(
      now.getTime() - DEFAULT_RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const normalized: Array<SellerInboxThreadPreview & { lastAtMs: number }> =
      [];
    const dailyCounts: Record<string, number> = {};
    let unreadThreads = 0;
    let newMessagesLast7Days = 0;

    for (const r of rawItems) {
      const buyerId = r?.buyerId ? String(r.buyerId) : "";
      const sellerId = r?.sellerId ? String(r.sellerId) : "";

      const viewerIsBuyer = buyerId === userId;
      const viewerIsSeller = sellerId === userId;

      // Only consider threads where the current user is actually a participant.
      if (!viewerIsBuyer && !viewerIsSeller) continue;

      const lastMessageAt =
        toDateOrNull(r?.lastMessageAt) ??
        toDateOrNull(r?.updatedAt) ??
        toDateOrNull(r?.createdAt) ??
        null;

      if (!lastMessageAt) continue;

      const buyerLastReadAt = toDateOrNull(r?.buyerLastReadAt);
      const sellerLastReadAt = toDateOrNull(r?.sellerLastReadAt);

      let unread = false;
      if (viewerIsBuyer) {
        unread =
          !buyerLastReadAt ||
          lastMessageAt.getTime() > buyerLastReadAt.getTime();
      } else if (viewerIsSeller) {
        unread =
          !sellerLastReadAt ||
          lastMessageAt.getTime() > sellerLastReadAt.getTime();
      }

      if (unread) unreadThreads++;
      if (lastMessageAt >= since) {
        newMessagesLast7Days++;
        const dayKey = lastMessageAt.toISOString().slice(0, 10); // YYYY-MM-DD
        dailyCounts[dayKey] = (dailyCounts[dayKey] ?? 0) + 1;
      }

      const other = viewerIsBuyer ? r?.seller : r?.buyer;
      const counterpartName =
        (other?.name as string | null) ??
        (other?.username as string | null) ??
        "User";

      const preview: SellerInboxThreadPreview & { lastAtMs: number } = {
        id: String(r?.id ?? ""),
        listingId: String(r?.listingId ?? ""),
        listingType:
          r?.listingType === "service"
            ? "service"
            : ("product" as "product" | "service"),
        counterpartName,
        counterpartUsername:
          (other?.username as string | null) ?? null,
        counterpartImage:
          (other?.image as string | null) ?? null,
        lastMessageAt: lastMessageAt.toISOString(),
        unread,
        messagesCount:
          typeof r?._count?.messages === "number"
            ? r._count.messages
            : 0,
        lastAtMs: lastMessageAt.getTime(),
      };

      if (!preview.id) continue;
      normalized.push(preview);
    }

    if (normalized.length === 0) {
      return EMPTY_INBOX_SUMMARY;
    }

    normalized.sort((a, b) => b.lastAtMs - a.lastAtMs);

    const recentThreads = normalized.slice(0, 4).map((t) => {
      const { lastAtMs, ...rest } = t;
      return rest;
    });

    const dailyMessageCounts: DailyCountPoint[] = Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalThreads: normalized.length,
      unreadThreads,
      newMessagesLast7Days,
      recentThreads,
      dailyMessageCounts,
    };
  } catch {
    return EMPTY_INBOX_SUMMARY;
  }
}

/**
 * Convenience helper: full dashboard bundle in one shot.
 * Handy for SSR pages or the /api/dashboard/summary endpoint.
 */
export async function getSellerDashboardSummary(
  userId: string,
  opts?: { listingsLimit?: number; windowDays?: number },
): Promise<SellerDashboardSummary> {
  if (!userId) throw new Error("userId is required for dashboard summary");

  // Build options object in an exactOptionalPropertyTypes-safe way
  const recentListingsOpts: { limit?: number; windowDays?: number } = {};
  if (typeof opts?.listingsLimit === "number") {
    recentListingsOpts.limit = opts.listingsLimit;
  }
  if (typeof opts?.windowDays === "number") {
    recentListingsOpts.windowDays = opts.windowDays;
  }

  const [metrics, inbox, recentListings] = await Promise.all([
    getSellerDashboardMetrics(userId),
    getSellerInboxSummary(userId),
    getSellerRecentListings(userId, recentListingsOpts),
  ]);

  return { metrics, inbox, recentListings };
}
