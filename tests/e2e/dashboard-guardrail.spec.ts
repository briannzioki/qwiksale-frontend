import { test, expect } from "@playwright/test";

test("Dashboard shows soft error UI instead of 500", async ({ page }) => {
  const resp = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  expect(resp).toBeTruthy();
  expect(resp!.status()).toBeLessThan(500);

  // Accept either a soft-error panel or a normal dashboard render
  const softError = page
    .getByText(/(we hit a dashboard error|failed to load|something went wrong)/i)
    .first();
  const normalDash = page.getByRole("heading", { name: /dashboard/i }).first();

  await expect
    .poll(
      async () => {
        const [a, b] = await Promise.all([softError.count(), normalDash.count()]);
        return a + b;
      },
      { timeout: 5000 }
    )
    .toBeGreaterThan(0);

  // Ensure no Next.js dev error overlay markers
  await expect(page.locator("text=This error happened")).toHaveCount(0);
});
