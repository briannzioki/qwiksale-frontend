// tests/e2e/smoke-prod.spec.ts
import { test, expect } from '@playwright/test';

test('All feed API includes both product and service', async ({ request }) => {
  const r = await request.get('/api/home-feed?limit=24');
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(j.mode).toBe('all');
  expect(Array.isArray(j.items)).toBeTruthy();
  expect(j.items.some((i: any) => i?.type === 'product')).toBeTruthy();
  expect(j.items.some((i: any) => i?.type === 'service')).toBeTruthy();
});

test('Home "All" tab shows a product link and a service link', async ({ page }) => {
  await page.goto('/');
  const allTab = page.getByRole('tab', { name: /^all$/i }).or(
    page.getByRole('button', { name: /^all$/i })
  );
  if (await allTab.isVisible().catch(() => false)) await allTab.click();

  // give content a brief moment to render
  await page.waitForTimeout(500);

  const productLink = page.locator('a[href^="/product/"]').first();
  const serviceLink = page.locator('a[href^="/service/"]').first();

  await expect(productLink, 'Expected at least one product card on the ALL tab.').toBeVisible();
  await expect(serviceLink, 'Expected at least one service card on the ALL tab.').toBeVisible();
});

test('Product page -> "Message seller" surfaces a result (dialog or error)', async ({ page, request }) => {
  const pf = await request.get('/api/home-feed?t=products&limit=4');
  expect(pf.ok()).toBeTruthy();
  const pj = await pf.json();
  const first = pj.items?.[0];
  expect(first?.id).toBeTruthy();

  await page.goto(`/product/${first.id}`);
  const button = page.getByRole('button', { name: /message seller/i }).first();
  await expect(button).toBeVisible();
  await button.click();

  const dialog = page.getByRole('dialog');
  const toastOrError = page.getByText(/error|failed|try again/i).first();
  await expect(dialog.or(toastOrError)).toBeVisible(); // fail if nothing happens
});

test('"Visit store" from product navigates without generic error', async ({ page, request }) => {
  const pf = await request.get('/api/home-feed?t=products&limit=4');
  expect(pf.ok()).toBeTruthy();
  const pj = await pf.json();
  const first = pj.items?.[0];
  expect(first?.id).toBeTruthy();

  await page.goto(`/product/${first.id}`);

  // Prefer a control named "Visit store", fall back to any /store/{username} link.
  const storeByName = page.getByRole('link', { name: /visit store/i }).first();
  const storeByBtn  = page.getByRole('button', { name: /visit store/i }).first();
  const storeHref   = page.locator('a[href^="/store/"]').first();

  const candidate = storeByName.or(storeByBtn).or(storeHref);
  await expect(candidate, 'Expected a way to navigate to the seller store.').toBeVisible();

  const waitForStoreNav = page.waitForNavigation({
    url: (u) => {
      try { return new URL(u).pathname.startsWith('/store/'); } catch { return false; }
    }
  });

  if (await storeHref.isVisible().catch(() => false)) {
    const href = await storeHref.getAttribute('href');
    expect(href, 'Store href should look like /store/{username}').toMatch(/^\/store\/[^/]+/);
    await Promise.all([waitForStoreNav, storeHref.click()]);
  } else {
    await Promise.all([waitForStoreNav, candidate.click()]);
  }

  await expect(page.getByText(/try again|something went wrong|error/i)).not.toBeVisible();
});

test('Dashboard route loads without 500 when logged out', async ({ page }) => {
  const resp = await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  expect(resp?.status(), 'Dashboard should not 500').toBeLessThan(500);
  await expect(page.getByText(/(500|exception|something went wrong|try again)/i)).not.toBeVisible();
});
