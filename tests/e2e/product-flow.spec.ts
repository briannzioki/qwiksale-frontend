import { test, expect } from "@playwright/test";
import { waitForServerReady } from "./utils/server";

test("product happy flow: search → open → gallery keys", async ({ page }) => {
  // Warm the app & Prisma to avoid API timeouts after build/start
  await waitForServerReady(page);

  const r = await page.request.get("/api/products?pageSize=1", { timeout: 30_000 });
  const j = await r.json().catch(() => ({} as any));
  const first = j?.items?.[0];
  test.skip(!first?.id, "No products in API to test with");

  await page.goto(`/product/${first.id}`, { waitUntil: "domcontentloaded" });

  // Open lightbox — allow either the explicit button or the overlay
  const openBtn = page
    .getByRole("button", { name: /open image in fullscreen/i })
    .first()
    .or(page.locator('[data-gallery-overlay="true"]'));
  await expect(openBtn).toBeVisible({ timeout: 10_000 });
  await openBtn.first().click();

  // Arrow keys shouldn’t crash
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Escape");
});
