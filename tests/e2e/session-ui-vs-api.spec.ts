// tests/e2e/session-ui-vs-api.spec.ts
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const AUTH_DIR = path.resolve(__dirname, ".auth");
const ADMIN_STATE = path.join(AUTH_DIR, "admin.json");
const USER_STATE = path.join(AUTH_DIR, "user.json");

const hasAdminState = fs.existsSync(ADMIN_STATE);
const hasUserState = fs.existsSync(USER_STATE);

async function getAccountTrigger(page: Page) {
  return page
    .getByTestId("account-menu-trigger")
    .or(
      page.getByRole("button", {
        name: /account|profile|open user menu|open account menu/i,
      }),
    )
    .or(
      page
        .locator(
          "header [data-testid='user-avatar'], header [aria-label*='account']",
        )
        .first(),
    );
}

async function expectSingleSessionChip(
  page: Page,
  kind: "role" | "plan",
): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const trigger = await getAccountTrigger(page);
  await expect(
    trigger,
    "Account button / avatar should be visible when signed in",
  ).toBeVisible();

  const chip = trigger.getByTestId("session-chip");
  await expect(chip, "exactly one session chip is rendered").toHaveCount(1);

  const text = (await chip.textContent())?.trim().toLowerCase() ?? "";
  expect(text.length, "session chip should have non-empty text").toBeGreaterThan(
    0,
  );

  if (kind === "role") {
    // Admin roles: tweak if your copy differs, but keep it clearly "privileged"
    expect(text).toMatch(/admin|superadmin|staff|mod/);
  } else {
    // Plans: tweak copy as needed, but keep it "plan-ish"
    expect(text).toMatch(/free|basic|standard|pro|premium|seller|plan/);
  }
}

test.describe("Session UI vs API chip rendering", () => {
  test.describe("Admin", () => {
    test.skip(!hasAdminState, "Missing admin auth storage state.");
    test.use({ storageState: ADMIN_STATE });

    test("exactly one role chip visible inside the account button", async ({
      page,
    }) => {
      await expectSingleSessionChip(page, "role");
    });
  });

  test.describe("User", () => {
    test.skip(!hasUserState, "Missing user auth storage state.");
    test.use({ storageState: USER_STATE });

    test("exactly one plan chip visible inside the account button", async ({
      page,
    }) => {
      await expectSingleSessionChip(page, "plan");
    });
  });
});
