// tests/e2e/home-tabs.spec.ts
import { test, expect } from "@playwright/test";
import { gotoHome, waitForServerReady } from "./utils/server";

test.describe("Home feed tabs", () => {
  test("Products & Services tabs render results", async ({ page }) => {
    await page.goto("/");

    // Tabs come from HomeClient ModeToggle (role=tablist)
    const productsTab = page.getByRole("tab", { name: "Products" });
    const servicesTab = page.getByRole("tab", { name: "Services" });

    await expect(productsTab).toBeVisible();
    await expect(servicesTab).toBeVisible();

    // Products
    await productsTab.click();
    // Section with aria-label="Search results" renders a grid of cards (links)
    const results = page.locator('section[aria-label="Search results"] >> a');
    await expect(results.first()).toBeVisible();

    // Services
    await servicesTab.click();
    await expect(results.first()).toBeVisible();
  });

  test("Unified API actually returns mixed types", async ({ request }) => {
    // API-level verification (UI doesn't have an 'All' tab)
    const res = await request.get("/api/home-feed?limit=24");
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    const types = (json.items ?? []).map((x: any) => x.type);
    const hasProduct = types.includes("product");
    const hasService = types.includes("service");
    // We expect at least some mix; if not, we flag it (no fix here)
    expect(hasService).toBeTruthy();
    expect(hasProduct).toBeTruthy();
  });
});
