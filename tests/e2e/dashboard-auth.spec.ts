import { test, expect } from "@playwright/test";

test("Dashboard loads as a signed-in user (cookie auth)", async ({ page, request }) => {
  const me = await request.get("/api/me", { failOnStatusCode: false });
  test.skip(me.status() !== 200, "Requires logged-in storage; set E2E_USER_* and rerun.");

  const resp = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  expect(resp?.ok()).toBeTruthy();

  await expect(page.getByText(/you need to sign in to view this page/i)).toHaveCount(0);

  const me2 = await page.request.get("/api/me", { failOnStatusCode: false });
  expect(me2.status()).toBe(200);
});
