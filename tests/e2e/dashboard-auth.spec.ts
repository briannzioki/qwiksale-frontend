// tests/e2e/dashboard-auth.spec.ts
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const AUTH_DIR = path.resolve(__dirname, ".auth");
const ADMIN_STATE = path.join(AUTH_DIR, "admin.json");
const USER_STATE = path.join(AUTH_DIR, "user.json");

const hasAdminState = fs.existsSync(ADMIN_STATE);
const hasUserState = fs.existsSync(USER_STATE);

async function openAccountMenu(page: Page) {
  const trigger = page
    .getByTestId("account-menu-trigger")
    .or(
      page.getByRole("button", {
        name: /account|profile|settings|open user menu|open account menu/i,
      }),
    )
    .or(
      page
        .locator(
          "header [data-testid='user-avatar'], header [aria-label*='account']",
        )
        .first(),
    );

  await expect(
    trigger,
    "Account menu trigger not found in header",
  ).toBeVisible();
  await trigger.click();
}

async function clickDashboardItem(page: Page) {
  const entry = page
    .getByRole("menuitem", { name: /dashboard/i })
    .or(page.getByRole("link", { name: /dashboard/i }))
    .or(page.getByRole("button", { name: /dashboard/i }));

  await expect(entry, "Dashboard menu entry not found").toBeVisible();

  await Promise.all([
    page.waitForURL(/\/(dashboard|admin)(\/|$)/),
    entry.first().click(),
  ]);
}

test.describe("Dashboard routing from account menu", () => {
  test.describe("Admins", () => {
    test.skip(!hasAdminState, "Missing admin auth storage state.");
    test.use({ storageState: ADMIN_STATE });

    test("Dashboard menu routes to /admin", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });

      await openAccountMenu(page);
      await clickDashboardItem(page);

      await expect(page).toHaveURL(/\/admin(\/|$)/);
      await expect(
        page.getByRole("heading", { name: /admin dashboard/i }),
      ).toBeVisible();
    });
  });

  test.describe("Users", () => {
    test.skip(!hasUserState, "Missing user auth storage state.");
    test.use({ storageState: USER_STATE });

    test("Dashboard menu routes to /dashboard", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });

      await openAccountMenu(page);
      await clickDashboardItem(page);

      await expect(page).toHaveURL(/\/dashboard(\/|$)/);
      await expect(
        page.getByRole("heading", { name: /dashboard/i }),
      ).toBeVisible();
    });
  });
});
