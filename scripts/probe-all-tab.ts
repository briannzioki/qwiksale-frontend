// scripts/probe-all-tab.ts
import { chromium } from 'playwright';

const base = process.env.PLAYWRIGHT_BASE_URL ?? 'https://qwiksale.sale';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${base}/`);
  const allTab = page.getByRole('tab', { name: /^all$/i }).or(
    page.getByRole('button', { name: /^all$/i })
  );
  if (await allTab.isVisible().catch(() => false)) await allTab.click();

  // let the grid render
  await page.waitForTimeout(800);

  const productHrefs = await page
    .locator('a[href^="/product/"]')
    .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href')));

  const serviceHrefs = await page
    .locator('a[href^="/service/"]')
    .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href')));

  console.log('ALL tab product hrefs:', productHrefs);
  console.log('ALL tab service hrefs:', serviceHrefs);
  console.log('Counts => products:', productHrefs.length, 'services:', serviceHrefs.length);

  await browser.close();
})();
