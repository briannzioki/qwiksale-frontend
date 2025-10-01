import { test, expect } from "@playwright/test";

test("Login → Dashboard loads", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator("text=Application error")).toHaveCount(0);
});
