// tests/e2e/home-tabs.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Home feed tabs", () => {
  test("Products & Services tabs render results", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // — Products tab —
    const productsTab = page.getByRole("tab", { name: /products/i }).first();
    if (await productsTab.count()) {
      await productsTab.click({ noWaitAfter: true });
      await expect(page).toHaveURL(/(\?|&)t=products/);
    }

    await expect
      .poll(async () => page.locator("[data-product-id]").count(), { timeout: 15_000 })
      .toBeGreaterThan(0);

    // — Services tab —
    const servicesTab = page.getByRole("tab", { name: /services/i }).first();
    if (await servicesTab.count()) {
      await servicesTab.click({ noWaitAfter: true });
      await expect(page).toHaveURL(/(\?|&)t=services/);
    }

    await expect
      .poll(async () => page.locator("[data-service-id]").count(), { timeout: 15_000 })
      .toBeGreaterThan(0);
  });

  test("Unified API actually returns mixed types", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect
      .poll(async () => {
        const productsCount: number = await page.locator("[data-product-id]").count();
        const servicesCount: number = await page.locator("[data-service-id]").count();
        // Return a boolean for Playwright's built-in matcher.
        return productsCount > 0 && servicesCount > 0;
      }, { timeout: 15_000 })
      .toBeTruthy();
  });
});
