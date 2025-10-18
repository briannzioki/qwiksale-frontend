import { test, expect } from "@playwright/test";
import { gotoHome } from "./utils/server";

test.describe("Home feed tabs", () => {
  test("Products & Services tabs render results", async ({ page }) => {
    await gotoHome(page);

    const productsTab =
      page.getByRole("tab", { name: /^products$/i })
        .or(page.getByRole("button", { name: /^products$/i }))
        .or(page.getByRole("link", { name: /^products$/i }));

    const servicesTab =
      page.getByRole("tab", { name: /^services$/i })
        .or(page.getByRole("button", { name: /^services$/i }))
        .or(page.getByRole("link", { name: /^services$/i }));

    // Always verify products show up (tabbed or not)
    if ((await productsTab.count()) > 0) {
      await productsTab.first().click({ noWaitAfter: true }).catch(() => {});
    }
    const productCard = page.locator('a[href^="/product/"]').first();
    await productCard.scrollIntoViewIfNeeded().catch(() => {});
    await expect(productCard).toBeVisible();

    // Try to show services via tab; otherwise fall back to URL or existing feed
    if ((await servicesTab.count()) > 0) {
      await servicesTab.first().click({ noWaitAfter: true }).catch(() => {});
      await Promise.race([
        page.waitForURL(/(\?|&)(t|tab)=services|#t=services/, { timeout: 1000 }).catch(() => {}),
        page.waitForTimeout(200),
      ]);
    } else {
      // No tab — try query param as a hint (ignore if your app doesn’t use it)
      await page.goto("/?t=services", { waitUntil: "domcontentloaded" }).catch(() => {});
    }

    const serviceCard = page.locator('a[href^="/service/"]').first();
    await serviceCard.scrollIntoViewIfNeeded().catch(() => {});
    await expect(serviceCard).toBeVisible();
  });
});
