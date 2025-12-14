// tests/unit/dashboard.lib.spec.ts
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

import {
  getSellerDashboardMetrics,
  getSellerRecentListings,
  getSellerInboxSummary,
  getSellerDashboardSummary,
  EMPTY_INBOX_SUMMARY,
} from "@/app/lib/dashboard";

const mockPrisma = {
  product: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  service: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
};

// Mock prisma module used by lib/dashboard.ts
vi.mock("@/app/lib/prisma", () => ({
  prisma: mockPrisma,
}));

const originalFetch = global.fetch;

beforeEach(() => {
  // reset prisma mocks before each test
  mockPrisma.product.count.mockReset();
  mockPrisma.product.findMany.mockReset();
  mockPrisma.service.count.mockReset();
  mockPrisma.service.findMany.mockReset();
});

afterEach(() => {
  // restore whatever fetch was before these tests
  (global as any).fetch = originalFetch;
});

describe("getSellerDashboardMetrics", () => {
  it("sums product and service counts into metrics", async () => {
    mockPrisma.product.count.mockResolvedValue(3);
    mockPrisma.service.count.mockResolvedValue(2);

    const metrics = await getSellerDashboardMetrics("user-1");

    expect(metrics.myListingsCount).toBe(5);
    expect(metrics.productsCount).toBe(3);
    expect(metrics.servicesCount).toBe(2);
    // With identical window counts, newLast7Days mirrors total
    expect(metrics.newLast7Days).toBe(5);
    expect(metrics.newProductsLast7Days).toBe(3);
    expect(metrics.newServicesLast7Days).toBe(2);
    expect(metrics.favoritesCount).toBe(0);
    expect(metrics.likesOnMyListings).toBe(0);
  });

  it("throws if userId is missing", async () => {
    // intentionally passing empty id to hit runtime guard
    await expect(getSellerDashboardMetrics("")).rejects.toThrow(
      /userId is required/i,
    );
  });
});

describe("getSellerRecentListings", () => {
  it("merges products and services and sorts by createdAt desc", async () => {
    const now = Date.now();
    const older = new Date(now - 3 * 24 * 60 * 60 * 1000);
    const newer = new Date(now - 1 * 24 * 60 * 60 * 1000);

    mockPrisma.product.findMany.mockResolvedValue([
      {
        id: "p1",
        name: "Phone",
        category: "Electronics",
        subcategory: null,
        price: 1000,
        image: null,
        location: "Nairobi",
        createdAt: older,
      },
    ]);

    mockPrisma.service.findMany.mockResolvedValue([
      {
        id: "s1",
        name: "Repair",
        category: "Services",
        subcategory: null,
        price: 500,
        image: null,
        location: "Nairobi",
        createdAt: newer,
      },
    ]);

    const listings = await getSellerRecentListings("user-1", {
      limit: 10,
      windowDays: 7,
    });

    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({
      type: "service",
      id: "s1",
      name: "Repair",
    });
    expect(listings[1]).toMatchObject({
      type: "product",
      id: "p1",
      name: "Phone",
    });
  });

  it("throws if userId is missing", async () => {
    // intentionally passing empty id to hit runtime guard
    await expect(getSellerRecentListings("")).rejects.toThrow(
      /userId is required/i,
    );
  });
});

describe("getSellerInboxSummary", () => {
  it("filters threads to those involving the viewer and counts unread + newMessagesLast7Days", async () => {
    const now = Date.now();
    const oneDayAgo = new Date(now - 1 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);

    const items = [
      // Viewer is buyer and has unread messages
      {
        id: "t1",
        listingId: "p1",
        listingType: "product",
        buyerId: "user-1",
        sellerId: "seller-1",
        lastMessageAt: oneDayAgo.toISOString(),
        buyerLastReadAt: threeDaysAgo.toISOString(), // older than last message → unread
        sellerLastReadAt: oneDayAgo.toISOString(),
        buyer: {
          id: "user-1",
          name: "Buyer One",
          username: "buyer1",
          image: null,
        },
        seller: {
          id: "seller-1",
          name: "Seller One",
          username: "seller1",
          image: null,
        },
        _count: { messages: 5 },
      },
      // Viewer is seller and thread is fully read
      {
        id: "t2",
        listingId: "s1",
        listingType: "service",
        buyerId: "buyer-2",
        sellerId: "user-1",
        lastMessageAt: threeDaysAgo.toISOString(),
        buyerLastReadAt: threeDaysAgo.toISOString(),
        sellerLastReadAt: new Date(now).toISOString(), // after last message
        buyer: {
          id: "buyer-2",
          name: "Buyer Two",
          username: "buyer2",
          image: null,
        },
        seller: {
          id: "user-1",
          name: "Myself",
          username: "me",
          image: null,
        },
        _count: { messages: 2 },
      },
      // Irrelevant thread (viewer is neither buyer nor seller)
      {
        id: "t3",
        listingId: "x",
        listingType: "product",
        buyerId: "other-buyer",
        sellerId: "other-seller",
        lastMessageAt: oneDayAgo.toISOString(),
        buyerLastReadAt: oneDayAgo.toISOString(),
        sellerLastReadAt: oneDayAgo.toISOString(),
        buyer: {
          id: "other-buyer",
          name: "Other",
          username: "other",
          image: null,
        },
        seller: {
          id: "other-seller",
          name: "Other Seller",
          username: "other-seller",
          image: null,
        },
        _count: { messages: 1 },
      },
    ];

    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ items }),
    });

    const summary = await getSellerInboxSummary("user-1");

    expect(summary.totalThreads).toBe(2);
    expect(summary.unreadThreads).toBe(1);
    // Both relevant threads are within the default 7-day window
    expect(summary.newMessagesLast7Days).toBe(2);
    expect(summary.recentThreads).toHaveLength(2);

    // Most recent (t1) should come first
    expect(summary.recentThreads[0]).toMatchObject({
      id: "t1",
      listingType: "product",
    });
  });

  it("returns EMPTY_INBOX_SUMMARY when fetch fails or returns no items", async () => {
    // Non-ok response
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "fail" }),
    });

    const summary1 = await getSellerInboxSummary("user-1");
    expect(summary1).toEqual(EMPTY_INBOX_SUMMARY);

    // Ok response but no items
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ items: [] }),
    });

    const summary2 = await getSellerInboxSummary("user-1");
    expect(summary2).toEqual(EMPTY_INBOX_SUMMARY);
  });
});

describe("getSellerDashboardSummary", () => {
  it("bundles metrics, inbox, and recent listings", async () => {
    mockPrisma.product.count.mockResolvedValue(0);
    mockPrisma.service.count.mockResolvedValue(0);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.service.findMany.mockResolvedValue([]);

    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ items: [] }),
    });

    const summary = await getSellerDashboardSummary("user-1", {
      listingsLimit: 4,
      windowDays: 7,
    });

    expect(summary.metrics.myListingsCount).toBe(0);
    expect(summary.inbox.totalThreads).toBe(0);
    expect(summary.recentListings).toHaveLength(0);
  });
});
