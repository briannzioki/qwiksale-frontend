import { test, expect } from "@playwright/test";
import { gotoHome, waitForServerReady } from "./utils/server";

test.describe("Home feed tabs", () => {
  test("Products & Services tabs render results", async ({ page }) => {
    await gotoHome(page);

    const productsTab = page.getByRole("tab", { name: /products/i }).first();
    if (await productsTab.count()) await productsTab.click();

    await expect
      .poll(async () => await page.locator("[data-product-id]").count(), { timeout: 15_000 })
      .toBeGreaterThan(0);

    const servicesTab = page.getByRole("tab", { name: /services/i }).first();
    if (await servicesTab.count()) await servicesTab.click();

    await expect
      .poll(async () => await page.locator("[data-service-id]").count(), { timeout: 15_000 })
      .toBeGreaterThan(0);
  });

  test("Unified API actually returns mixed types", async ({ page }) => {
    await waitForServerReady(page);
    const r = await page.request.get("/api/home-feed?t=all&pageSize=16", { timeout: 30_000 });
    const j = await r.json().catch(() => ({} as any));
    const items = j?.items ?? [];
    const hasProduct = items.some((x: any) => x?.type === "product");
    const hasService = items.some((x: any) => x?.type === "service");
    expect(hasProduct).toBeTruthy();
    expect(hasService).toBeTruthy();
  });
});
