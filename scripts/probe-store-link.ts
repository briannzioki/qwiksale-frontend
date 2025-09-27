// scripts/probe-store-link.ts
import { chromium, request } from 'playwright';

const base = process.env.PLAYWRIGHT_BASE_URL ?? 'https://qwiksale.sale';

(async () => {
  const api = await request.newContext({ baseURL: base });
  const r = await api.get('/api/home-feed?t=products&limit=4');
  if (!r.ok()) throw new Error('home-feed products call failed');
  const j = await r.json();
  const first = j.items?.[0];
  if (!first?.id) throw new Error('no product id in feed');

  console.log('Using product id:', first.id);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${base}/product/${first.id}`);

  const storeLink = page.locator('a[href^="/store/"]').first();
  const hasStore = await storeLink.isVisible().catch(() => false);
  console.log('Store link visible:', hasStore);

  if (!hasStore) {
    console.log('No visible /store/ link on the product page.');
    await browser.close();
    process.exit(2);
  }

  const href = await storeLink.getAttribute('href');
  console.log('Store href:', href);

  // Directly hit the store route via API to see the HTTP status
  const storeResp = await api.get(href!);
  console.log('Store GET status:', storeResp.status());

  if (storeResp.status() >= 500) {
    console.log('First 400 chars of response:');
    console.log((await storeResp.text()).slice(0, 400));
  }

  await browser.close();
})();
