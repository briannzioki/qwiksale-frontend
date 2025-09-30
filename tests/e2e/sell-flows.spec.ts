import { test, expect } from "@playwright/test";
import { waitForServerReady } from "./utils/server";

test("Sell Product page vs Edit Product page show different states", async ({ page }) => {
  await page.goto("/sell/product", { waitUntil: "domcontentloaded" });

  const createBtn = page.getByRole("button", { name: /create|publish|list/i });
  const signInCta = page.getByRole("link", { name: /sign in|login/i }).first();

  if (await createBtn.count()) {
    await expect(createBtn).toBeVisible();
  } else {
    await expect(signInCta).toBeVisible();
  }

  // Pull a product id for the edit flow, but be tolerant of a cold backend.
  await waitForServerReady(page);
  const pf = await page.request.get("/api/products?pageSize=1", { timeout: 30_000 });
  const pj = await pf.json().catch(() => ({} as any));
  const first = pj?.items?.[0];

  test.skip(!first?.id, "No products in API to test with");

  await page.goto(`/sell/product?id=${first.id}`, { waitUntil: "domcontentloaded" });
  const editBtn = page.getByRole("button", { name: /save|update|edit/i });
  await expect(editBtn).toBeVisible();
});
