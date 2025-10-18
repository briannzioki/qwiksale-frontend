import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const AUTH_DIR = path.resolve(__dirname, ".auth");
const ADMIN_STATE = path.join(AUTH_DIR, "admin.json");
const USER_STATE = path.join(AUTH_DIR, "user.json");

const hasAdminState = fs.existsSync(ADMIN_STATE);
const hasUserState = fs.existsSync(USER_STATE);

/**
 * NOTE:
 * Some apps don’t auto-redirect "/" or "/dashboard" after sign-in.
 * These tests assert capabilities instead of exact redirect behavior:
 *   - Admin can access /admin (and it renders)
 *   - Normal user is blocked from /admin (redirect OR 401/403 OR visible unauthorized UI)
 */

test.describe("Admin auth/redirects", () => {
  test.skip(!hasAdminState, "Missing admin auth storage state.");
  test.use({ storageState: ADMIN_STATE });

  test("admin can reach /admin and it renders", async ({ page }) => {
    const res = await page.goto("/admin", { waitUntil: "domcontentloaded" });
    expect(res?.ok()).toBeTruthy();

    // sanity checks for admin UI chrome
    await expect(page.getByRole("heading", { name: /admin/i })).toBeVisible();
  });

  test("visiting / or /dashboard does not break; admin area remains accessible", async ({ page }) => {
    const r1 = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(r1?.status()).toBeLessThan(500);

    const r2 = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    expect(r2?.status()).toBeLessThan(500);

    const r3 = await page.goto("/admin", { waitUntil: "domcontentloaded" });
    expect(r3?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: /admin/i })).toBeVisible();
  });
});

test.describe("User auth/redirects", () => {
  test.skip(!hasUserState, "Missing user auth storage state.");
  test.use({ storageState: USER_STATE });

  test("visiting / resolves (home or /dashboard) and dashboard is accessible", async ({ page }) => {
    const res = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);

    const d = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    expect(d?.status()).toBeLessThan(500);

    // Less brittle: prove the session is valid via API instead of relying on a heading
    const me = await page.request.get("/api/me", { failOnStatusCode: false });
    expect(me.status(), await me.text()).toBe(200);
  });

  test("trying to open /admin is hard-blocked (redirect, 401/403, or unauthorized UI)", async ({ page }) => {
    const res = await page.goto("/admin", { waitUntil: "domcontentloaded" });

    // Accept ANY valid block behavior
    const urlIsAdmin = /\/admin(\/|$)/.test(page.url());
    const status = res?.status() ?? 0;

    const unauthorizedUI = await page
      .getByText(/(unauthorized|forbidden|you need to sign in|not allowed)/i)
      .count();

    const blocked = !urlIsAdmin || status === 401 || status === 403 || unauthorizedUI > 0;
    expect(blocked).toBeTruthy();

    // And definitely do not show obvious admin UI when blocked
    await expect(page.getByRole("heading", { name: /admin/i })).toHaveCount(0);
  });
});
