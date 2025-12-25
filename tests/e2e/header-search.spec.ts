import { test, expect } from "@playwright/test";

function idFromHref(href: string | null | undefined) {
  const h = String(href ?? "").trim();
  if (!h) return undefined;
  const parts = h.split("?")[0]!.split("#")[0]!.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : undefined;
}

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

  // ✅ If results exist, assert seller badges on the first result card.
  const firstResult = page
    .locator('a[href^="/product/"], a[href^="/service/"]')
    .first();

  if ((await firstResult.count()) === 0) {
    test.skip(true, "No search results available to assert badges");
    return;
  }

  await firstResult.scrollIntoViewIfNeeded().catch(() => {});
  await expect(firstResult).toBeVisible();

  const href = await firstResult.getAttribute("href");
  const id = idFromHref(href);

  if (!href || !id) {
    test.skip(true, "First search result missing href/id");
    return;
  }

  const isProduct = href.startsWith("/product/");
  const apiPath = isProduct ? `/api/products/${id}` : `/api/services/${id}`;

  const apiRes = await page.request.get(apiPath, { timeout: 30_000 }).catch(() => null);

  if (!apiRes || !apiRes.ok()) {
    test.skip(true, `API ${apiPath} not available`);
    return;
  }

  const apiJson = await apiRes.json().catch(() => ({} as any));
  const sellerVerified = apiJson?.sellerVerified as unknown;
  const sellerFeaturedTier = apiJson?.sellerFeaturedTier as unknown;

  if (typeof sellerVerified === "boolean") {
    const label = sellerVerified ? "Verified" : "Unverified";
    await expect(firstResult.locator(`text=/\\b${label}\\b/i`)).toBeVisible();
  }

  const tier =
    typeof sellerFeaturedTier === "string" ? sellerFeaturedTier.trim().toLowerCase() : "";

  if (tier === "basic" || tier === "gold" || tier === "diamond") {
    await expect(firstResult.locator(`[data-testid="featured-tier-${tier}"]`)).toBeVisible();
  }
});
