import { test, expect, type Page } from "@playwright/test";

async function expectSignedInUI(page: Page): Promise<void> {
  const header = page.locator("header");
  await expect(header.getByRole("link", { name: /^sign in$/i })).toHaveCount(0);
}

test("session persists across home ⇄ dashboard", async ({ page, request }) => {
  const me = await page.request.get("/api/me", { failOnStatusCode: false, timeout: 30_000 });
  test.skip(me.status() !== 200, "Requires logged-in storage; set E2E_USER_* and rerun.");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expectSignedInUI(page);

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expectSignedInUI(page);
});
