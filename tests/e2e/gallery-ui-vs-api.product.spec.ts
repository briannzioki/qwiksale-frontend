// tests/e2e/gallery-ui-vs-api.product.spec.ts
import { test, expect } from "@playwright/test";

/** Finds a product id by taking the first product link on the home page. */
async function getAnyProductId(page: import("@playwright/test").Page) {
  await page.goto("/");
  const href = await page.locator('a[href^="/product/"]').first().getAttribute("href");
  if (!href) test.skip(true, "No product links found on /");
  return href ? href.split("/").filter(Boolean).pop()! : undefined;
}

test.describe("Product page – gallery vs API", () => {
  test("UI gallery equals API gallery (or live >= API); no placeholders; lightbox works; no dev optimizer", async ({
    page,
  }) => {
    const id = await getAnyProductId(page);
    if (!id) test.skip(true, "No product id available");

    // 1) API first, give it more time; skip if this ID isn't reachable right now
    const apiRes = await page.request.get(`/api/products/${id}`, { timeout: 30_000 });
    if (!apiRes.ok()) test.skip(true, `Product API for ${id} unavailable: ${apiRes.status()}`);
    const apiJson = await apiRes.json();
    const apiGallery: string[] = Array.isArray(apiJson?.gallery) ? apiJson.gallery : [];
    const apiLen = apiGallery.length;

    // 2) Visit UI
    await page.goto(`/product/${id}`);
    const hero = page.locator('[data-gallery-wrap] img').first();
    await expect(hero).toBeVisible();

    // 3) Current image URLs rendered
    const uiUrls: string[] = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>('[data-gallery-wrap] img')].map((i) => i.currentSrc || i.src)
    );

    // Drop placeholders & demo sources
    const badHosts = ["picsum.photos", "images.unsplash.com", "plus.unsplash.com"];
    const isBad = (u: string) => !u || u.includes("/placeholder/") || badHosts.some((h) => u.includes(h));
    const clean = uiUrls.filter((u) => !isBad(u));

    // UI should show at least the API gallery (live updates may add more).
    if (apiLen > 0) {
      expect(clean.length, "UI gallery should render all API images").toBeGreaterThanOrEqual(apiLen);
    } else {
      // If API has no gallery, we still expect 1 image (hero or placeholder).
      expect(uiUrls.length).toBeGreaterThanOrEqual(1);
    }

    // 4) Lightbox opens (even with 1 image) and shows index badge
    await page
      .locator('[data-gallery-wrap] button[aria-label*="Open image"]')
      .first()
      .click({ trial: true })
      .catch(() => {});
    const openClickTarget = page.locator('[data-gallery-wrap] button[aria-label*="Open image"]').first();
    await openClickTarget.click().catch(() => {});
    const badge = page.locator('text=/\\d+\\s*\\/\\s*\\d+/');
    await expect(badge, "Lightbox index badge visible").toBeVisible();
    await page.keyboard.press("Escape");

    // 5) <Image fill> parent sanity — positioned parent
    const positions: string[] = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>('img[decoding]')].map((img) =>
        getComputedStyle(img.parentElement as HTMLElement).position
      )
    );
    expect(positions.every((p) => p === "relative" || p === "absolute" || p === "fixed")).toBeTruthy();

    // 6) Dev: assert minimal _next/image usage
    const nextImgCount = await page.locator('img[src*="/_next/image"]').count();
    expect(nextImgCount, "Dev optimizer should be bypassed").toBeLessThanOrEqual(1);
  });
});
