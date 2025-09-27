import { test, expect } from "@playwright/test";

const EMAIL = process.env["E2E_EMAIL"];
const PASS  = process.env["E2E_PASSWORD"];

test.skip(!EMAIL || !PASS, "No E2E_EMAIL/PASSWORD set");

test("Login → Dashboard loads", async ({ page }) => {
  await page.goto("/api/auth/signin");
  await page.getByLabel(/email/i).fill(EMAIL!);
  await page.getByLabel(/password/i).fill(PASS!);

  // Try generic sign-in button; adapt if your provider has different labels.
  await page.getByRole("button", { name: /sign in|log in/i }).click();

  // Expect landing to dashboard or link to it
  await page.waitForLoadState("domcontentloaded");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(/dashboard|welcome/i)).toBeVisible();
});
