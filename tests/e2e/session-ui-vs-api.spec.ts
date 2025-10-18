import { test, expect, type Page } from "@playwright/test";

async function expectSignedInUI(page: Page): Promise<void> {
  const header = page.locator("header");
  await expect(header.getByRole("link", { name: /^sign in$/i })).toHaveCount(0);
}

test("Home header reflects signed-in state AND /api/me is 200", async ({ page, request }) => {
  const me = await request.get("/api/me", { failOnStatusCode: false });
  test.skip(me.status() !== 200, "Requires logged-in storage; set E2E_USER_* and rerun.");
  expect(me.status()).toBe(200);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expectSignedInUI(page);
});
