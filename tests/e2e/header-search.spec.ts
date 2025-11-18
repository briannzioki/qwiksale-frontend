// tests/e2e/header-search.spec.ts
import { test, expect } from "@playwright/test";

test("header inline search opens and submits to /search", async ({ page }) => {
  // Wait for the page (and header) to fully hydrate so the inline
  // search form + handlers are ready.
  await page.goto("/", { waitUntil: "networkidle" });

  // Ensure the header inline search exists.
  await page.getByTestId("header-inline-search-toggle").waitFor();

  // Open the inline search via the header toggle.
  await page.getByTestId("header-inline-search-toggle").click();

  // Type a query into the inline header search input and submit with Enter.
  const input = page.getByTestId("header-inline-search-input");
  await input.fill("iphone");
  await input.press("Enter");

  // We should navigate to /search?q=iphone and render the search heading.
  await expect(page).toHaveURL(/\/search\?q=iphone/);
  await expect(page.getByRole("heading", { name: /search/i })).toBeVisible();
});
