// tests/e2e/search-routing.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Search page (URL-driven SSR)", () => {
  test("deep link to products works with no jank", async ({ page }) => {
    await page.goto("/search?q=car&type=product");
    await expect(page).toHaveURL(/\/search\?q=car&type=product/);
    await expect(page.getByRole("heading", { name: /search/i })).toBeVisible();

    // Filters reflect URL
    await expect(page.locator("select[name='type']")).toHaveValue("product");

    // Basic result shell renders (grid exists even if empty dataset)
    // NOTE: use the live region / summary element, not any ancestor div that contains the text.
    await expect(
      page
        .locator('[aria-live="polite"]')
        .filter({ hasText: /Showing/i })
        .first(),
    ).toBeVisible();
  });

  test("switching type updates URL and refetches", async ({ page }) => {
    await page.goto("/search?q=cleaning&type=product");
    await page.selectOption("select[name='type']", "service");

    // Submit filters (form posts GET to /search)
    await page.getByRole("button", { name: /apply filters/i }).click();

    await expect(page).toHaveURL(/type=service/);
    await expect(
      page.getByRole("heading", { name: /search services/i }),
    ).toBeVisible();
  });
});
