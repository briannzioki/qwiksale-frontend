// tests/e2e/profile-save.spec.ts
import { test, expect } from "@playwright/test";

test.describe("profile: save changes", () => {
  test.use({ storageState: "tests/e2e/.auth/user.json" });

  test("saving profile shows success notice and persists after reload", async ({ page }) => {
    // Ensure auth-backed API is reachable in this storage state; otherwise skip cleanly.
    const probe = await page.request.get("/api/me/profile", { failOnStatusCode: false, timeout: 30_000 });
    test.skip(probe.status() !== 200, "Requires logged-in storage; /api/me/profile must return 200.");

    await page.goto("/account/profile", { waitUntil: "domcontentloaded" });

    // Core UI loads
    await expect(page.getByRole("heading", { name: /your profile/i })).toBeVisible({ timeout: 20_000 });

    // Target an edit that is always safe: city
    const city = page.locator('input#city, input[name="city"]').first();
    await expect(city).toBeVisible({ timeout: 15_000 });

    const before = (await city.inputValue().catch(() => "")).trim();

    // Toggle between two stable values so repeated runs don’t accumulate noise.
    const next = before.toLowerCase() === "nairobi" ? "Mombasa" : "Nairobi";

    await city.fill(next);

    const saveBtn = page.getByTestId("profile-save-cta").first();
    await expect(saveBtn).toBeVisible({ timeout: 15_000 });
    await saveBtn.click();

    // Success UX: inline notice (plus toast, but we assert the deterministic notice)
    const ok = page.getByTestId("profile-save-success").first();
    await expect(ok).toBeVisible({ timeout: 20_000 });
    await expect(ok).toContainText(/changes saved/i);

    // Reload and confirm the value persisted.
    await page.reload({ waitUntil: "domcontentloaded" });

    const city2 = page.locator('input#city, input[name="city"]').first();
    await expect(city2).toBeVisible({ timeout: 15_000 });

    // Give the profile loader a moment to populate fields (it fetches no-store)
    await expect(city2).toHaveValue(next, { timeout: 20_000 });
  });
});
