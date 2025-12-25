import { test, expect } from "@playwright/test";
import { gotoHome } from "./utils/server";

function idFromHref(href: string | null | undefined) {
  const h = String(href ?? "").trim();
  if (!h) return undefined;
  const parts = h.split("?")[0]!.split("#")[0]!.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : undefined;
}

async function assertBadgesIfPresentOnCard(
  page: import("@playwright/test").Page,
  card: import("@playwright/test").Locator,
  kind: "product" | "service",
) {
  const href = await card.getAttribute("href");
  const id = idFromHref(href);
  if (!id) return;

  const apiPath = kind === "product" ? `/api/products/${id}` : `/api/services/${id}`;
  const apiRes = await page.request.get(apiPath, { timeout: 30_000 }).catch(() => null);
  if (!apiRes || !apiRes.ok()) return;

  const apiJson = await apiRes.json().catch(() => ({} as any));
  const sellerVerified = apiJson?.sellerVerified as unknown;
  const sellerFeaturedTier = apiJson?.sellerFeaturedTier as unknown;

  if (typeof sellerVerified === "boolean") {
    const label = sellerVerified ? "Verified" : "Unverified";
    await expect(card.locator(`text=/\\b${label}\\b/i`)).toBeVisible();
  }

  const tier =
    typeof sellerFeaturedTier === "string" ? sellerFeaturedTier.trim().toLowerCase() : "";
  if (tier === "basic" || tier === "gold" || tier === "diamond") {
    await expect(card.locator(`[data-testid="featured-tier-${tier}"]`)).toBeVisible();
  }
}

test.describe("Home feed tabs", () => {
  test("Products & Services tabs render results", async ({ page }) => {
    await gotoHome(page);

    const productsTab = page
      .getByRole("tab", { name: /^products$/i })
      .or(page.getByRole("button", { name: /^products$/i }))
      .or(page.getByRole("link", { name: /^products$/i }));

    const servicesTab = page
      .getByRole("tab", { name: /^services$/i })
      .or(page.getByRole("button", { name: /^services$/i }))
      .or(page.getByRole("link", { name: /^services$/i }));

    // Always verify products show up (tabbed or not)
    if ((await productsTab.count()) > 0) {
      await productsTab.first().click({ noWaitAfter: true }).catch(() => {});
    }
    const productCard = page.locator('a[href^="/product/"]').first();
    await productCard.scrollIntoViewIfNeeded().catch(() => {});
    await expect(productCard).toBeVisible();

    // ✅ Badge assertions (only if API provides the data for that seller)
    await assertBadgesIfPresentOnCard(page, productCard, "product");

    // Try to show services via tab; otherwise fall back to URL or existing feed
    if ((await servicesTab.count()) > 0) {
      await servicesTab.first().click({ noWaitAfter: true }).catch(() => {});
      await Promise.race([
        page
          .waitForURL(/(\?|&)(t|tab)=services|#t=services/, { timeout: 1000 })
          .catch(() => {}),
        page.waitForTimeout(200),
      ]);
    } else {
      // No tab — try query param as a hint (ignore if your app doesn’t use it)
      await page.goto("/?t=services", { waitUntil: "domcontentloaded" }).catch(() => {});
    }

    const serviceCard = page.locator('a[href^="/service/"]').first();
    await serviceCard.scrollIntoViewIfNeeded().catch(() => {});
    await expect(serviceCard).toBeVisible();

    // ✅ Badge assertions (only if API provides the data for that seller)
    await assertBadgesIfPresentOnCard(page, serviceCard, "service");
  });
});
