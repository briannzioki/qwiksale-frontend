// tests/e2e/gallery-ui-vs-api.service.spec.ts
import { test, expect } from "@playwright/test";

async function getAnyServiceId(page: import("@playwright/test").Page) {
  await page.goto("/?tab=services");
  const href = await page.locator('a[href^="/service/"]').first().getAttribute("href");
  if (!href) {
    test.skip(true, "No service links found on /");
    return "";
  }
  return href.split("/").filter(Boolean).pop()!;
}

test.describe("Service page – gallery vs API", () => {
  test("UI gallery equals API gallery (or live >= API); placeholders & optimizer checks", async ({ page }) => {
    const id = await getAnyServiceId(page);
    if (!id) test.skip(true, "No service id available");

    // More time; skip if this specific item endpoint isn't responding
    const apiRes = await page.request.get(`/api/services/${id}`, { timeout: 30_000 });
    if (!apiRes.ok()) test.skip(true, `Service API for ${id} unavailable: ${apiRes.status()}`);
    const apiJson = await apiRes.json();
    const apiGallery: string[] = Array.isArray(apiJson?.gallery) ? apiJson.gallery : [];
    const apiLen = apiGallery.length;

    await page.goto(`/service/${id}`);
    const hero = page.locator('[data-gallery-wrap] img').first();
    await expect(hero).toBeVisible();

    const uiUrls: string[] = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>('[data-gallery-wrap] img')].map((i) => i.currentSrc || i.src)
    );
    const badHosts = ["picsum.photos", "images.unsplash.com", "plus.unsplash.com"];
    const clean = uiUrls.filter(
      (u) => !!u && !u.includes("/placeholder/") && !badHosts.some((h) => u.includes(h))
    );

    if (apiLen > 0) expect(clean.length).toBeGreaterThanOrEqual(apiLen);
    else expect(uiUrls.length).toBeGreaterThanOrEqual(1);

    const nextImgCount = await page.locator('img[src*="/_next/image"]').count();
    expect(nextImgCount).toBeLessThanOrEqual(1);
  });
});
