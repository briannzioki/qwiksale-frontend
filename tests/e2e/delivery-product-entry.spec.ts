import { test, expect, type Page } from "@playwright/test";
import { pickFirstVisible } from "./_helpers/signin";

test.use({ storageState: "tests/e2e/.auth/user.json" });

function isActiveStatus(raw: unknown): boolean {
  const s = String(raw ?? "").trim();
  if (!s) return true; // treat missing status as usable
  return s.toUpperCase() === "ACTIVE";
}

async function isNotFoundOrUnavailableUI(page: Page): Promise<boolean> {
  const checks = [
    page.getByRole("heading", { level: 1, name: /we can[’']t find that page/i }),
    page.getByText(/404\s*-\s*not found/i),
    page.getByRole("heading", { level: 1, name: /listing unavailable/i }),
    page.getByText(/this product was removed|isn[’']t available/i),
  ];

  for (const loc of checks) {
    try {
      if (await loc.first().isVisible({ timeout: 400 })) return true;
    } catch {
      // ignore
    }
  }

  return false;
}

function extractItemsArray(json: any): any[] {
  if (!json || typeof json !== "object") return [];
  if (Array.isArray(json.items)) return json.items;
  if (Array.isArray(json.products)) return json.products;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.results)) return json.results;
  if (Array.isArray(json.listings)) return json.listings;
  return [];
}

function coerceId(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === "undefined" || lower === "null" || lower === "nan") return null;
  return s;
}

async function fetchCandidateProductIds(page: Page, limit = 25): Promise<string[]> {
  const endpoints = [
    `/api/products?page=1&pageSize=${limit}`,
    `/api/products?take=${limit}`,
    `/api/products?limit=${limit}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await page.request.get(url, {
        failOnStatusCode: false,
        headers: { accept: "application/json", "cache-control": "no-store" },
      });

      if (!res.ok()) continue;

      const json = await res.json().catch(() => null);
      const items = extractItemsArray(json);

      const ids: string[] = [];
      for (const it of items) {
        const status = (it as any)?.status ?? (it as any)?.listingStatus ?? (it as any)?.state ?? null;
        if (!isActiveStatus(status)) continue;

        const id =
          coerceId((it as any)?.id) ??
          coerceId((it as any)?.productId) ??
          coerceId((it as any)?._id) ??
          null;

        if (id) ids.push(id);
      }

      if (ids.length) return Array.from(new Set(ids));
    } catch {
      // ignore and try next endpoint
    }
  }

  return [];
}

async function gotoFirstValidProductPage(
  page: Page,
  preferredId?: string | null,
): Promise<{ productId: string; usedFallback: boolean } | null> {
  const seen = new Set<string>();
  const candidates: { id: string; usedFallback: boolean }[] = [];

  const pref = coerceId(preferredId);
  if (pref && !seen.has(pref)) {
    seen.add(pref);
    candidates.push({ id: pref, usedFallback: false });
  }

  const fromApi = await fetchCandidateProductIds(page, 25);
  for (const id of fromApi) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    candidates.push({ id, usedFallback: true });
  }

  for (const c of candidates) {
    const res = await page.goto(`/product/${encodeURIComponent(c.id)}`, {
      waitUntil: "domcontentloaded",
    });

    // Some Next.js notFound flows can still return 200 while rendering a 404 UI, so check both.
    if (res && res.status() === 404) continue;
    if (await isNotFoundOrUnavailableUI(page)) continue;

    return { productId: c.id, usedFallback: c.usedFallback };
  }

  return null;
}

test("product CTA deep-links into Delivery with product/store context", async ({ page }) => {
  const preferred = process.env["E2E_PRODUCT_ID"] ?? "";

  const picked = await gotoFirstValidProductPage(page, preferred);
  if (!picked) {
    test.skip(
      true,
      "No ACTIVE product listing found for E2E (set E2E_PRODUCT_ID to a real ACTIVE product id, or ensure the DB has at least one ACTIVE product).",
    );
  }

  const productId = picked!.productId;

  const cta =
    (await pickFirstVisible([
      page.locator('[data-testid="delivery-cta-store"]'),
      page.getByRole("link", { name: /find carrier near this store/i }),
      page.getByRole("button", { name: /find carrier near this store/i }),
    ])) ?? null;

  if (!cta) {
    throw new Error(
      'Could not find Delivery CTA on product page. Expected data-testid="delivery-cta-store" (preferred) or a link/button named "Find carrier near this store".',
    );
  }

  await cta.scrollIntoViewIfNeeded().catch(() => {});
  await cta.click();

  await expect(page).toHaveURL(/\/delivery\?/i, { timeout: 15_000 });

  const u = new URL(page.url());
  expect(u.pathname).toBe("/delivery");
  expect(u.searchParams.get("near")).toBe("store");

  const pid = u.searchParams.get("productId") ?? "";
  // If the app includes productId (it should), it must match what we actually navigated with.
  if (pid) {
    expect(pid).toBe(productId);
  }
});
