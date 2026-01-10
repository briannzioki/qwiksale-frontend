// tests/e2e/sell-flows.spec.ts
import { test, expect, type Locator, type Page } from "@playwright/test";
import { waitForServerReady } from "./utils/server";

test.describe("sell flows", () => {
  // This spec is explicitly about the authenticated "sell" UI.
  // Use the known logged-in user storage state from global-setup.
  test.use({ storageState: "tests/e2e/.auth/user.json" });

  async function getSubmitCtaFromProductForm(page: Page): Promise<Locator> {
    // Wait for the core form field that exists in both create/edit modes.
    const title = page.getByLabel("Title").first();
    await expect(title).toBeVisible({ timeout: 15_000 });

    // Scope to the actual form that owns the Title field.
    const form = title.locator("xpath=ancestor::form[1]");

    // Prefer the real submit button (this avoids accidentally reading the "Create New" link).
    const submitByType = form.locator('button[type="submit"]').first();
    if ((await submitByType.count().catch(() => 0)) > 0) return submitByType;

    // Fallback: any reasonable CTA button within the form.
    return form
      .getByRole("button", { name: /post|create|publish|save|update|edit/i })
      .first();
  }

  async function gotoAndAssertMode(page: Page, url: string, mode: "create" | "edit") {
    const res = await page.goto(url, { waitUntil: "domcontentloaded" });
    expect(res?.ok()).toBeTruthy();

    const cta = await getSubmitCtaFromProductForm(page);
    await expect(cta).toBeVisible({ timeout: 15_000 });

    const text = ((await cta.textContent().catch(() => "")) || "").trim().toLowerCase();
    expect(text.length).toBeGreaterThan(0);

    if (mode === "create") {
      // Create mode should look like a "new listing" action.
      expect(text).toMatch(/post|create|publish/);
      expect(text).not.toMatch(/save|update|edit/);
    } else {
      // Edit mode should look like an "edit / save" action.
      expect(text).toMatch(/save|update|edit/);
    }
  }

  test("Sell Product page vs Edit Product page show different states", async ({ page }) => {
    // Warm the app & Prisma to avoid flakiness on first navigation/API use.
    await waitForServerReady(page);

    // Sanity-check that authenticated storage is actually valid for this run.
    const me = await page.request.get("/api/me", {
      failOnStatusCode: false,
      timeout: 30_000,
      headers: { accept: "application/json", "cache-control": "no-store" },
    });
    test.skip(
      me.status() !== 200,
      "Requires logged-in storage; ensure tests/e2e/.auth/user.json is present and valid (global-setup).",
    );

    // CREATE MODE: /sell/product (no id)
    await gotoAndAssertMode(page, "/sell/product", "create");

    // EDIT MODE: any non-empty id should flip the UI into "edit" state
    const editId = "example-id";
    await gotoAndAssertMode(page, `/sell/product?id=${encodeURIComponent(editId)}`, "edit");
  });
});
