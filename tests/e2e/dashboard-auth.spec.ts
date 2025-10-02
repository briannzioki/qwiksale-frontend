import { test, expect } from "@playwright/test";
import path from "path";

// Always use the state file written by global-setup.
// (No env vars; no conditional skip.)
const statePath = path.resolve(process.cwd(), "tests/e2e/.auth/state.json");
test.use({ storageState: statePath });

test("Dashboard loads as a signed-in user (cookie auth)", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  // Should NOT show the signed-out banner.
  await expect(
    page.getByText(/you need to sign in to view this page/i)
  ).toHaveCount(0);

  // /api/me should be OK for signed-in user.
  const resp = await page.request.get("/api/me", {
    headers: { "cache-control": "no-store" },
  });
  expect(resp.status()).toBe(200);
});
