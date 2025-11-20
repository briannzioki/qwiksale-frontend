// tests/e2e/prod.auth-session.spec.ts
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const AUTH_DIR = path.resolve(__dirname, ".auth");
const ADMIN_STATE = path.join(AUTH_DIR, "admin.json");
const USER_STATE = path.join(AUTH_DIR, "user.json");

const hasAdminState = fs.existsSync(ADMIN_STATE);
const hasUserState = fs.existsSync(USER_STATE);

test.describe("API auth sanity for /api/me", () => {
  const statePath = hasUserState ? USER_STATE : ADMIN_STATE;

  test.skip(
    !statePath,
    "Requires stored auth state; set E2E_USER_* or E2E_ADMIN_* and re-run.",
  );

  test.use({ storageState: statePath });

  test("/api/me returns 200 for authenticated storage", async ({ page }) => {
    const res = await page.request.get("/api/me", {
      failOnStatusCode: false,
    });

    const status = res.status();
    expect(
      status,
      `Expected /api/me to be 200 with auth storage, got ${status}`,
    ).toBe(200);

    const json = await res.json().catch(() => null);
    expect(json && (json as any).id, "API should return user object").toBeTruthy();
  });
});
