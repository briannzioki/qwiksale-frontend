// tests/e2e/reset-password.spec.ts
import { test, expect } from "@playwright/test";

test.describe("reset password", () => {
  const email = process.env["E2E_USER_EMAIL"] || "";
  const enabled =
    process.env["QS_E2E"] === "1" || process.env["PLAYWRIGHT"] === "1" || process.env["E2E"] === "1";

  test.skip(!enabled, "Set QS_E2E=1 (or PLAYWRIGHT=1 / E2E=1) to enable reset-password E2E.");
  test.skip(!email, "Set E2E_USER_EMAIL to an existing seeded user email.");

  test("request reset returns resetUrl and reset flow succeeds", async ({ page, request }) => {
    // 1) Request a reset link (API-level, reliable)
    const res = await request.post("/api/account/request-password-reset", {
      data: { email, returnTo: "/dashboard" },
      headers: { "content-type": "application/json" },
    });

    expect(res.ok()).toBeTruthy();

    const j: any = await res.json().catch(() => ({}));
    expect(j?.resetUrl, "Expected API to return resetUrl in QS_E2E mode.").toBeTruthy();

    const u = new URL(String(j.resetUrl));
    await page.goto(`${u.pathname}${u.search}`);

    // 2) UI shows set-password mode
    await expect(page.getByRole("heading", { name: /set a new password/i })).toBeVisible();

    // 3) Submit new password
    const newPw = `NewPass!${Date.now()}`;

    await page.fill("#password", newPw);
    await page.fill("#confirm", newPw);

    await page.getByRole("button", { name: /update password/i }).click();

    // 4) Success UI appears
    await expect(page.getByRole("status")).toContainText(/password updated/i);

    // 5) Sign-in link is present (we don’t assume your sign-in form selectors here)
    await expect(page.getByRole("link", { name: /continue to sign in/i })).toBeVisible();
  });
});
