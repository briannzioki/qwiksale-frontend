// tests/e2e/admin-access.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Admin access control", () => {
  test.describe("anonymous", () => {
    // Force this spec to run with NO cookies / NO storage
    test.use({ storageState: { cookies: [], origins: [] } });

    test("anonymous is bounced to /signin when visiting /admin", async ({ page }) => {
      await page.goto("/admin", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/signin\?callbackUrl=/);
      await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    });
  });

  test.describe("with admin credentials", () => {
    const hasAdminCreds =
      !!process.env["E2E_ADMIN_EMAIL"] && !!process.env["E2E_ADMIN_PASSWORD"];

    test.skip(
      !hasAdminCreds,
      "Set E2E_ADMIN_EMAIL/PASSWORD to run admin flow",
    );

    // Reuse pre-authenticated admin storage prepared in global-setup.
    test.use({
      storageState: "tests/e2e/.auth/admin.json",
    });

    test("admin lands on Admin home and can open Users + Listings (SSR)", async ({ page }) => {
      // Already authenticated; hitting /admin should render the admin dashboard.
      await page.goto("/admin", { waitUntil: "domcontentloaded" });
      await expect(
        page.getByRole("heading", { name: /admin dashboard/i }),
      ).toBeVisible();

      // Users page SSR loads
      await page.getByRole("link", { name: /users/i }).first().click();
      await expect(
        page.getByRole("heading", { name: /all users/i }),
      ).toBeVisible();

      // Listings page SSR loads
      await page.getByRole("link", { name: /listings/i }).first().click();
      await expect(
        page.getByRole("heading", { name: /all listings/i }),
      ).toBeVisible();
    });
  });
});
