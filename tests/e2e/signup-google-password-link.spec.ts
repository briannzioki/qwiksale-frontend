import { test, expect } from "@playwright/test";

test.describe("signup: google signup returns to signup to set password", () => {
  test.use({ storageState: "tests/e2e/.auth/user.json" });

  test("signed-in user visiting /signup?from=google sees email prefilled and can proceed after setting password", async ({
    page,
  }) => {
    const expectedEmailMaybe = process.env["E2E_USER_EMAIL"];
    test.skip(!expectedEmailMaybe, "E2E_USER_EMAIL must be set.");

    const expectedEmail: string = String(expectedEmailMaybe).trim().toLowerCase();

    // Mock the password-link endpoint so we don't mutate the real DB/user password during E2E.
    await page.route("**/api/me/password", async (route) => {
      const req = route.request();
      if (req.method().toUpperCase() !== "POST") return route.fallback();

      const body = req.postData() || "";
      if (!/password/i.test(body) || !/confirm/i.test(body)) {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Bad payload" }),
          headers: { "cache-control": "no-store" },
        });
      }

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
        headers: { "cache-control": "no-store" },
      });
    });

    await page.goto(`/signup?from=google&return=${encodeURIComponent("/dashboard")}`, {
      waitUntil: "domcontentloaded",
    });

    // Prefer testid (stable), fall back to label/role if markup changes later.
    const emailInput = page.getByTestId("signup-email").first();
    await expect(emailInput).toBeVisible({ timeout: 15_000 });
    await expect(emailInput).toHaveValue(expectedEmail);

    const pw = "Woza@1234";

    const pwInput = page.getByTestId("signup-password").first();
    const cfInput = page.getByTestId("signup-confirm-password").first();

    await expect(pwInput).toBeVisible({ timeout: 15_000 });
    await expect(cfInput).toBeVisible({ timeout: 15_000 });

    await pwInput.fill(pw);
    await cfInput.fill(pw);

    await page.getByTestId("signup-set-password-cta").click();

    await expect(page).toHaveURL(/\/onboarding\?/i, { timeout: 15_000 });

    const u = new URL(page.url());
    expect(u.pathname).toBe("/onboarding");
    expect(u.searchParams.get("callbackUrl")).toBe("/dashboard");
  });

  test("signin page shows Create account link that preserves callbackUrl via ?return=", async ({ page }) => {
    // Use logged-out state to ensure we're truly on the signin screen
    await page.context().clearCookies();

    await page.goto(`/signin?callbackUrl=${encodeURIComponent("/dashboard")}`, {
      waitUntil: "domcontentloaded",
    });

    const createLink = page.getByRole("link", { name: /create an account/i }).first();
    await expect(createLink).toBeVisible({ timeout: 15_000 });

    const href = (await createLink.getAttribute("href")) || "";
    expect(href).toMatch(/^\/signup\?/);
    expect(href).toContain("return=");
  });
});
