import { test, expect } from "@playwright/test";
import { signInViaUi } from "./_helpers/signin";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[e2e] Missing env ${name}`);
  return v;
}

async function expectSessionPresent(page: any) {
  const res = await page.request.get("/api/auth/session", {
    failOnStatusCode: false,
    headers: { accept: "application/json", "cache-control": "no-store" },
  });

  expect(res.status(), "GET /api/auth/session should be 200").toBe(200);

  const j = await res.json().catch(() => null);
  expect(j?.user, "session JSON should include user").toBeTruthy();

  const jar = await page.context().cookies();
  const cookieNames = jar.map((c: any) => c.name);

  // Be tolerant: next-auth v4 and auth.js v5 differ.
  const hasSessionCookie = cookieNames.some((n: string) => /session-token/i.test(n));
  expect(
    hasSessionCookie,
    `expected a session cookie, saw: ${cookieNames.slice(0, 30).join(", ")}`,
  ).toBeTruthy();
}

test.describe("auth UI", () => {
  // Always start logged-out for these tests.
  test.use({ storageState: "tests/e2e/.auth/state.json" });

  test("signin UI creates a session (user)", async ({ page }) => {
    const email = mustEnv("E2E_USER_EMAIL");
    const password = mustEnv("E2E_USER_PASSWORD");

    await signInViaUi(page, { email, password, callbackUrl: "/dashboard" });

    await expect(page).not.toHaveURL(/\/signin(\?|$)/i, { timeout: 10_000 });
    await expectSessionPresent(page);
  });

  test("signin UI creates a session (admin)", async ({ page }) => {
    const email = mustEnv("E2E_ADMIN_EMAIL");
    const password = mustEnv("E2E_ADMIN_PASSWORD");

    await signInViaUi(page, { email, password, callbackUrl: "/admin" });

    await expect(page).not.toHaveURL(/\/signin(\?|$)/i, { timeout: 10_000 });
    await expectSessionPresent(page);
  });
});
