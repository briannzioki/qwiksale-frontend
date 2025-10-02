import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

async function expectSignedInUI(page: Page): Promise<void> {
  const header = page.locator("header");
  await expect(header.getByRole("link", { name: /^sign in$/i })).toHaveCount(0);
}

test("session persists across home ⇄ dashboard", async ({ page, request }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expectSignedInUI(page);

  const me1 = await request.get("/api/me", { failOnStatusCode: false });
  expect(me1.status(), await me1.text()).toBe(200);

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/you need to sign in/i)).toHaveCount(0);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expectSignedInUI(page);

  const me2 = await request.get("/api/me", { failOnStatusCode: false });
  expect(me2.status(), await me2.text()).toBe(200);
});
