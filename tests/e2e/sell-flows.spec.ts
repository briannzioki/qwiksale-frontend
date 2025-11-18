// tests/e2e/sell-flows.spec.ts
import { test, expect } from "@playwright/test";

test("Sell Product page vs Edit Product page show different states", async ({
  page,
  request,
}) => {
  const me = await request.get("/api/me", { failOnStatusCode: false });
  test.skip(
    me.status() !== 200,
    "Requires logged-in storage; set E2E_USER_* and rerun.",
  );

  // CREATE MODE: /sell/product (no id)
  const res = await page.goto("/sell/product", {
    waitUntil: "domcontentloaded",
  });
  expect(res?.ok()).toBeTruthy();

  const createBtn = page.locator('[data-testid="sell-product-mode-cta"]');
  await expect(createBtn).toBeVisible();
  const createText = (await createBtn.innerText()).toLowerCase();

  // Should look like a "new listing" action
  expect(createText).toMatch(/post|create/);
  expect(createText).not.toMatch(/save|update|edit/);

  // EDIT MODE: any non-empty id should flip the UI into "edit" state
  const editId = "example-id";

  const res2 = await page.goto(
    `/sell/product?id=${encodeURIComponent(editId)}`,
    { waitUntil: "domcontentloaded" },
  );
  expect(res2?.ok()).toBeTruthy();

  const editBtn = page.locator('[data-testid="sell-product-mode-cta"]');
  await expect(editBtn).toBeVisible();
  const editText = (await editBtn.innerText()).toLowerCase();

  // Should look like an "edit / save" action
  expect(editText).toMatch(/save|update|edit/);
});
