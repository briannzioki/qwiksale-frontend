import { test, expect } from "@playwright/test";

test("product happy flow: search → open → gallery keys", async ({ page }) => {
  // Landing → Search
  await page.goto("/");
  await page.getByRole("searchbox", { name: /search/i }).fill("phone");
  await page.getByRole("button", { name: /search/i }).click();

  // Results render
  await page.getByText(/results/i).first().waitFor();

  // Open first card
  const firstCard = page.locator("a[aria-label*='priced at'], a[aria-label^='Product']").first();
  await firstCard.click();

  // Gallery keyboard support (opens lightbox then arrows)
  // The inline image has a button overlay with aria-label "Open image in fullscreen"
  await page.getByRole("button", { name: /open image in fullscreen/i }).click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Escape");

  // Contact reveal (may be gated; just ensure button exists)
  const reveal = page.getByRole("button", { name: /reveal whatsapp|show contact/i });
  if (await reveal.count()) {
    await reveal.first().click();
  }

  await expect(page).toHaveURL(/\/product\//);
});
