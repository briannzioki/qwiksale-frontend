import { test, expect } from "@playwright/test";

test("Sell Product page vs Edit Product page show different states", async ({ page, request }) => {
  const me = await request.get("/api/me", { failOnStatusCode: false });
  test.skip(me.status() !== 200, "Requires logged-in storage; set E2E_USER_* and rerun.");

  // (existing test logic below)
  const res = await page.goto("/sell/product", { waitUntil: "domcontentloaded" });
  expect(res?.ok()).toBeTruthy();

  // ... whatever selectors you already had
  // Example:
  const first = { id: "example-id" }; // if you fetch one earlier, keep that logic
  await page.goto(`/sell/product?id=${first.id}`, { waitUntil: "domcontentloaded" });
  const editBtn = page.getByRole("button", { name: /save|update|edit/i });
  await expect(editBtn).toBeVisible();
});
