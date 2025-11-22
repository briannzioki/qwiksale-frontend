// tests/e2e/admin-guardrail.spec.ts
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const AUTH_DIR = path.resolve(__dirname, ".auth");
const ADMIN_STATE = path.join(AUTH_DIR, "admin.json");
const USER_STATE = path.join(AUTH_DIR, "user.json");

const hasAdminState = fs.existsSync(ADMIN_STATE);
const hasUserState = fs.existsSync(USER_STATE);

const ADMIN_ROUTES = ["/admin/users", "/admin/listings"];

test.describe("Admin guardrails", () => {
  test.describe("as ADMIN", () => {
    test.skip(!hasAdminState, "Missing admin auth storage state.");
    test.use({ storageState: ADMIN_STATE });

    for (const route of ADMIN_ROUTES) {
      test(`ADMIN can load ${route} with SSR content`, async ({ page }) => {
        const resp = await page.goto(route, { waitUntil: "domcontentloaded" });
        expect(resp?.ok()).toBeTruthy();

        // Top-level admin shell should render
        await expect(
          page.getByRole("heading", { name: "Admin console" }),
        ).toBeVisible();

        // Route-specific heading (Users/Listings/etc.)
        const routeHeadingName =
          route === "/admin/users"
            ? "Admin · Users"
            : "Admin · Listings";

        const heading = page.getByRole("heading", { name: routeHeadingName });
        await expect(heading).toBeVisible();

        // No Next.js error overlays
        const html = await page.content();
        expect(html).not.toMatch(
          /__next_error__|Application error|500 Internal/i,
        );
      });
    }
  });

  test.describe("as USER", () => {
    test.skip(!hasUserState, "Missing user auth storage state.");
    test.use({ storageState: USER_STATE });

    for (const route of ADMIN_ROUTES) {
      test(`USER is blocked from ${route}`, async ({ page }) => {
        const resp = await page
          .goto(route, { waitUntil: "domcontentloaded" })
          .catch(() => null);

        const status = resp?.status() ?? 0;
        const pathname = new URL(page.url()).pathname;

        const unauthorizedUI = await page
          .getByText(
            /(unauthorized|forbidden|not allowed|admin only|need to sign in)/i,
          )
          .count();

        const stillOnProtected =
          pathname === route || pathname.startsWith(route + "/");

        // "Blocked" = we are NOT sitting on /admin/users|/admin/listings
        // OR the response is 401/403 OR explicit unauthorized UI.
        const blocked =
          !stillOnProtected ||
          status === 401 ||
          status === 403 ||
          unauthorizedUI > 0;

        expect(blocked).toBeTruthy();

        // Normal users must not see admin shell headings
        await expect(
          page.getByRole("heading", { name: /admin/i }),
        ).toHaveCount(0);
      });
    }
  });
});
