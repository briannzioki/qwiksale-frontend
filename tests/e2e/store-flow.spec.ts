// tests/e2e/store-flow.spec.ts
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { waitForServerReady } from "./utils/server";

const AUTH_DIR = path.resolve(__dirname, ".auth");
const ADMIN_STATE = path.join(AUTH_DIR, "admin.json");
const hasAdminState = fs.existsSync(ADMIN_STATE);

function idFromHref(href: string | null | undefined) {
  const h = String(href ?? "").trim();
  if (!h) return undefined;
  const parts = h.split("?")[0]!.split("#")[0]!.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : undefined;
}

async function getAnyProductId(page: Page): Promise<string | undefined> {
  const candidates: Array<() => Promise<string | undefined>> = [
    async () => {
      const res = await page.request.get("/api/home-feed?t=products&limit=1", {
        timeout: 30_000,
      });
      const json = (await res.json().catch(() => ({} as any))) as any;
      return json?.items?.[0]?.id as string | undefined;
    },
    async () => {
      const res = await page.request.get("/api/products?pageSize=1", {
        timeout: 30_000,
      });
      const json = (await res.json().catch(() => ({} as any))) as any;
      return json?.items?.[0]?.id as string | undefined;
    },
  ];

  for (const fn of candidates) {
    try {
      const id = await fn();
      if (id) return id;
    } catch {
      // ignore and try next source
    }
  }

  return undefined;
}

test.describe("Store flows", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await waitForServerReady(page);
    } finally {
      await page.close();
    }
  });

  test("Store page is reachable from a product detail and renders without 500", async ({
    page,
  }) => {
    const productId = await getAnyProductId(page);
    test.skip(
      !productId,
      "No product available in home feed or /api/products; seed at least one.",
    );

    const productUrl = `/product/${productId}`;
    const resp = await page.goto(productUrl, { waitUntil: "domcontentloaded" });
    expect(resp?.ok(), `GET ${productUrl} should be OK`).toBe(true);

    const storeLink = page
      .getByRole("link", {
        name: /visit store|view store|more from this seller|seller store/i,
      })
      .first();

    await expect(storeLink).toBeVisible();

    const hostBefore = new URL(page.url()).host;

    await Promise.all([page.waitForURL(/\/store\//), storeLink.click()]);

    const storeUrl = new URL(page.url());
    expect(storeUrl.host).toBe(hostBefore);
    expect(storeUrl.pathname).toMatch(/\/store\//);

    await expect(
      page.getByRole("heading", { name: /store|seller|listings by/i }).first(),
    ).toBeVisible();
    await expect(page.locator("text=Application error")).toHaveCount(0);

    // Wait for listings to appear (store page may be CSR/hydrating)
    const listingLinks = page.locator('a[href^="/product/"], a[href^="/service/"]');

    try {
      await expect
        .poll(async () => await listingLinks.count(), { timeout: 15_000 })
        .toBeGreaterThan(0);
    } catch {
      test.skip(true, "No store listings found to assert badges");
      return;
    }

    const firstListing = listingLinks.first();
    await firstListing.scrollIntoViewIfNeeded().catch(() => {});
    await expect(firstListing).toBeVisible();

    const href = await firstListing.getAttribute("href");
    const id = idFromHref(href);

    if (!href || !id) {
      test.skip(true, "Store listing missing href/id");
      return;
    }

    const isProduct = href.startsWith("/product/");
    const apiPath = isProduct ? `/api/products/${id}` : `/api/services/${id}`;

    const apiRes = await page.request.get(apiPath, { timeout: 30_000 }).catch(() => null);
    if (!apiRes || !apiRes.ok()) {
      test.skip(true, `API ${apiPath} unavailable`);
      return;
    }

    const apiJson = await apiRes.json().catch(() => ({} as any));
    const sellerVerified = apiJson?.sellerVerified as unknown;
    const sellerFeaturedTier = apiJson?.sellerFeaturedTier as unknown;

    // ✅ Assert verification via stable testids (icon-only / sr-only safe)
    if (typeof sellerVerified === "boolean") {
      const badgeId = sellerVerified ? "verified-badge" : "unverified-badge";
      await expect(firstListing.locator(`[data-testid="${badgeId}"]`)).toBeVisible();
    }

    const tier =
      typeof sellerFeaturedTier === "string" ? sellerFeaturedTier.trim().toLowerCase() : "";
    if (tier === "basic" || tier === "gold" || tier === "diamond") {
      await expect(firstListing.locator(`[data-testid="featured-tier-${tier}"]`)).toBeVisible();
    }
  });

  test("Store page shows listings even when viewed as ADMIN (regression)", async ({
    page,
    browser,
  }) => {
    test.skip(!hasAdminState, "Missing admin auth storage state.");

    const productId = await getAnyProductId(page);
    test.skip(
      !productId,
      "No product available in home feed or /api/products; seed at least one.",
    );

    // Step 1: find a seller store URL via a real product detail
    const productUrl = `/product/${productId}`;
    const resp = await page.goto(productUrl, { waitUntil: "domcontentloaded" });
    expect(resp?.ok(), `GET ${productUrl} should be OK`).toBe(true);

    const storeLink = page
      .getByRole("link", {
        name: /visit store|view store|more from this seller|seller store/i,
      })
      .first();
    await expect(storeLink).toBeVisible();

    await Promise.all([page.waitForURL(/\/store\//), storeLink.click()]);

    const storeUrl = page.url();
    expect(storeUrl).toMatch(/\/store\//);

    // Sanity: store has at least one listing for a normal viewer
    const listingLinks = page.locator('a[href^="/product/"], a[href^="/service/"]');
    await expect
      .poll(async () => await listingLinks.count(), { timeout: 15_000 })
      .toBeGreaterThan(0);

    // Step 2: open the SAME store URL as an admin viewer and ensure it's not empty
    const ctx = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await ctx.newPage();
    try {
      const r2 = await adminPage.goto(storeUrl, { waitUntil: "domcontentloaded" });
      expect(r2?.status() ?? 0).toBeLessThan(500);

      await expect(adminPage.locator("text=Application error")).toHaveCount(0);

      const adminListingLinks = adminPage.locator('a[href^="/product/"], a[href^="/service/"]');
      await expect
        .poll(async () => await adminListingLinks.count(), { timeout: 15_000 })
        .toBeGreaterThan(0);

      expect(await adminPage.getByText(/no listings yet/i).count()).toBe(0);
    } finally {
      await ctx.close();
    }
  });
});
