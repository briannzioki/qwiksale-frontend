import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

async function expectSignedInUI(page: Page): Promise<void> {
  const header = page.locator("header");
  await page.waitForLoadState("networkidle");
  await expect(header.getByRole("link", { name: /^sign in$/i })).toHaveCount(0);
}

test("Home header reflects signed-in state AND /api/me is 200", async ({ page, request }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const me = await request.get("/api/me", { failOnStatusCode: false });
  expect(me.status(), await me.text()).toBe(200);

  await expectSignedInUI(page);
});
