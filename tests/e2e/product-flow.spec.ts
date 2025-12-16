import { test, expect } from "@playwright/test";
import { waitForServerReady } from "./utils/server";

test("product happy flow: search → open → gallery keys", async ({ page }) => {
  // Warm the app & Prisma to avoid API timeouts after build/start
  await waitForServerReady(page);

  const r = await page.request.get("/api/products?pageSize=1", { timeout: 30_000 });
  const j = await r.json().catch(() => ({} as any));
  const first = j?.items?.[0];
  test.skip(!first?.id, "No products in API to test with");

  // Pull badge expectations (only assert if data exists)
  const detailApi = await page.request.get(`/api/products/${first.id}`, { timeout: 30_000 }).catch(() => null);
  const detailJson = detailApi && detailApi.ok() ? await detailApi.json().catch(() => ({} as any)) : ({} as any);

  const sellerVerified = detailJson?.sellerVerified as unknown;
  const sellerFeaturedTier = detailJson?.sellerFeaturedTier as unknown;

  await page.goto(`/product/${first.id}`, { waitUntil: "domcontentloaded" });

  // ✅ Assert badges near public UI (only if API provides the data)
  if (typeof sellerVerified === "boolean") {
    const label = sellerVerified ? "Verified" : "Unverified";
    await expect(page.getByText(new RegExp(`\\b${label}\\b`, "i")).first()).toBeVisible();
  }
  const tier = typeof sellerFeaturedTier === "string" ? sellerFeaturedTier.trim().toLowerCase() : "";
  if (tier === "basic" || tier === "gold" || tier === "diamond") {
    await expect(page.getByText(new RegExp(`\\b${tier}\\b`, "i")).first()).toBeVisible();
  }

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
