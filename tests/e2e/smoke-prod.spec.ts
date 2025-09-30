import { test, expect } from "@playwright/test";
import { waitForServerReady, gotoHome } from "./utils/server";
import type { Page } from "@playwright/test"; // type-only import to satisfy verbatimModuleSyntax

async function getAnyProductId(page: Page): Promise<string | undefined> {
  try {
    const pf = await page.request.get("/api/products?pageSize=1", { timeout: 30_000 });
    const pj = await pf.json().catch(() => ({} as any));
    const id = pj?.items?.[0]?.id as string | undefined;
    if (id) return id;
  } catch {
    /* ignore */
  }
  try {
    const hf = await page.request.get("/api/home-feed?t=all&pageSize=24", { timeout: 30_000 });
    const hj = await hf.json().catch(() => ({} as any));
    const id = (hj?.items ?? []).find((x: any) => x?.type === "product")?.id as string | undefined;
    if (id) return id;
  } catch {
    /* ignore */
  }
  return undefined;
}

test("All feed API includes both product and service", async ({ page }) => {
  await waitForServerReady(page);

  const r = await page.request.get("/api/home-feed?t=all&pageSize=24", { timeout: 30_000 });
  const j = await r.json().catch(() => ({} as any));
  const items = j?.items ?? [];
  const hasProduct = items.some((x: any) => x?.type === "product");
  const hasService = items.some((x: any) => x?.type === "service");
  expect(hasProduct).toBeTruthy();
  expect(hasService).toBeTruthy();
});

test('Home "All" tab shows a product link and a service link', async ({ page }) => {
  await gotoHome(page);
  const allTab = page.getByRole("tab", { name: /all/i }).first();
  if (await allTab.isVisible()) await allTab.click();

  const productLink = page.locator('a[href*="/product/"]').first();
  const serviceLink = page.locator('a[href*="/service/"]').first();
  await expect(productLink).toBeVisible();
  await expect(serviceLink).toBeVisible();
});

test('Product page -> "Message seller" surfaces a result (dialog or error)', async ({ page }) => {
  await waitForServerReady(page);
  const productId = await getAnyProductId(page);
  test.skip(!productId, "No products in API to test with");

  await page.goto(`/product/${productId}`, { waitUntil: "domcontentloaded" });

  const button = page.getByRole("button", { name: /message seller/i }).first();
  await expect(button).toBeVisible();
  await button.click();

  // tolerate either a dialog or any visible error UI
  const dialog = page.getByRole("dialog");
  const errorUI = page
    .getByRole("alert")
    .or(page.locator("[data-toast]"))
    .or(page.locator("text=Please sign in"))
    .or(page.getByText(/login|sign in|error|failed/i));

  await expect
    .poll(async () => (await dialog.count()) > 0 || (await errorUI.count()) > 0, { timeout: 12_000 })
    .toBeTruthy();

  if (await dialog.count()) await expect(dialog).toBeVisible();
});

test('"Visit store" from product navigates without generic error', async ({ page }) => {
  await waitForServerReady(page);
  const productId = await getAnyProductId(page);
  test.skip(!productId, "No products in API to test with");

  await page.goto(`/product/${productId}`, { waitUntil: "domcontentloaded" });
  const visit = page.getByRole("link", { name: /visit store/i }).first();
  await expect(visit).toBeVisible();
  await Promise.all([page.waitForURL(/\/store\//), visit.click()]);
  await expect(page.locator("text=Application error")).toHaveCount(0);
});

test("Dashboard route loads without 500 when logged out", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator("text=Application error")).toHaveCount(0);
});
