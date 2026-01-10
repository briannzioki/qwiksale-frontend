import { test, expect, type Page } from "@playwright/test";

async function expectSignedInUI(page: Page): Promise<void> {
  const header = page.locator("header");
  await expect(header.getByRole("link", { name: /^sign in$/i })).toHaveCount(0);
}

async function getMeWithRetry(page: Page, attempts = 3) {
  let lastErr: any = null;

  for (let i = 0; i < attempts; i++) {
    try {
      return await page.request.get("/api/me", {
        failOnStatusCode: false,
        timeout: 30_000,
        headers: { accept: "application/json", "cache-control": "no-store" },
      });
    } catch (e: any) {
      lastErr = e;
      // brief backoff (server may be busy after previous test/build)
      await page.waitForTimeout(400 + i * 450);
    }
  }

  throw lastErr ?? new Error("Failed to call /api/me after retries.");
}

test("session persists across home ⇄ dashboard", async ({ page }) => {
  const me = await getMeWithRetry(page, 3);
  test.skip(me.status() !== 200, "Requires logged-in storage; set E2E_USER_* and rerun.");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expectSignedInUI(page);

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expectSignedInUI(page);
});
