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

    test("Dashboard menu routes to /dashboard and shows dashboard UI", async ({
      page,
    }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });

      await openAccountMenu(page);
      await clickDashboardItem(page);

      await expect(page).toHaveURL(/\/dashboard(\/|$)/);

      // Main heading
      const heading = page.getByRole("heading", { name: /dashboard/i }).first();
      await expect(heading).toBeVisible();

      // ---- Metrics row ----
      const summaryRegion = page.getByRole("region", {
        name: /dashboard summary/i,
      });
      await expect(
        summaryRegion,
        "Dashboard summary region missing",
      ).toBeVisible();

      await expect(
        summaryRegion.getByText(/my listings/i),
      ).toBeVisible();
      await expect(
        summaryRegion.getByText(/my favorites/i),
      ).toBeVisible();
      await expect(
        summaryRegion.getByText(/new in last 7 days/i),
      ).toBeVisible();
      await expect(
        // aligned with DashboardMetrics.tsx label
        summaryRegion.getByText(/listing likes/i),
      ).toBeVisible();

      // ---- Activity charts ----
      const chartsRegion = page.getByRole("region", {
        name: /activity charts/i,
      });
      await expect(
        chartsRegion,
        "Activity charts region missing",
      ).toBeVisible();

      // We don't care about exact values, but legends should be present.
      // Use exact text so strict mode only sees the legend labels,
      // not the caption or empty-state copy.
      await expect(
        chartsRegion.getByText(/^listings$/i),
      ).toBeVisible();
      await expect(
        chartsRegion.getByText(/^messages$/i),
      ).toBeVisible();

      // ---- Messages snapshot ----
      const messagesRegion = page.getByRole("region", {
        name: /messages snapshot/i,
      });
      await expect(
        messagesRegion,
        "Messages snapshot region missing",
      ).toBeVisible();

      await expect(messagesRegion.getByText(/^messages$/i)).toBeVisible();
      await expect(
        messagesRegion.getByText(/inbox overview/i),
      ).toBeVisible();
      await expect(
        messagesRegion.getByRole("link", { name: /open inbox/i }),
      ).toBeVisible();
    });
  });

  test.describe("Guests", () => {
    test("Guest sees dashboard guest CTA and no dashboard metrics/messages/charts", async ({
      page,
    }) => {
      // No storageState here → true guest
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

      const guestContainer = page.locator('[data-e2e="dashboard-guest"]');
      await expect(
        guestContainer,
        "Expected guest dashboard CTA container",
      ).toBeVisible();

      // Ensure the authenticated-only regions are NOT rendered.
      await expect(
        page.getByRole("region", { name: /dashboard summary/i }),
      ).toHaveCount(0);

      await expect(
        page.getByRole("region", { name: /messages snapshot/i }),
      ).toHaveCount(0);

      await expect(
        page.getByRole("region", { name: /activity charts/i }),
      ).toHaveCount(0);
    });
  });
});
