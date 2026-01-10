import { test, expect } from "@playwright/test";
import { pickFirstVisible } from "./_helpers/signin";

test.use({ storageState: "tests/e2e/.auth/user.json" });

test("header/nav entry to Delivery works for signed-in user", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard(\?|$)/i);

  // Prefer header/nav link, but allow a dashboard shortcut as fallback.
  const deliveryLink =
    (await pickFirstVisible([
      page.getByRole("navigation").getByRole("link", { name: /delivery/i }),
      page.getByRole("banner").getByRole("link", { name: /delivery/i }),
      page.getByRole("link", { name: /delivery/i }),
      page.getByRole("button", { name: /delivery/i }),
    ])) ?? null;

  if (!deliveryLink) {
    throw new Error('Could not find a "Delivery" link/button in header/nav or page.');
  }

  await deliveryLink.click();

  await expect(page).toHaveURL(/\/delivery(\?|$)/i, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /delivery/i })).toBeVisible({ timeout: 15_000 });
});
