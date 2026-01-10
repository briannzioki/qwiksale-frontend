import { chromium, FullConfig } from "@playwright/test";
import path from "node:path";

export default async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects?.[0]?.use?.baseURL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    "http://localhost:3000";

  const storagePath = path.resolve(__dirname, "../.auth/state.json");
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    if (!email || !password) {
      await context.storageState({ path: storagePath });
      console.log("Auth storageState (empty) written to", storagePath);
      await browser.close();
      return;
    }

    // Go to site & open sign-in (robust to route differences)
    await page.goto(baseURL + "/", { waitUntil: "domcontentloaded" });
    const signInLink = page.getByRole("link", { name: /^sign in$/i });
    if (await signInLink.count()) {
      await signInLink.first().click();
    } else {
      // Common fallbacks
      await page.goto(baseURL + "/auth/signin", { waitUntil: "domcontentloaded" }).catch(() => {});
      if (!/signin/i.test(page.url())) {
        await page.goto(baseURL + "/login", { waitUntil: "domcontentloaded" }).catch(() => {});
      }
    }

    // Fill email/password (multiple selector strategies)
    await (page.locator('input[name="email"], input[type="email"], #email').first()).fill(email);
    await (page.locator('input[name="password"], input[type="password"], #password').first()).fill(password);

    // Submit
    const submit = page.getByRole("button", { name: /sign in|log in|continue/i }).first();
    if (await submit.count()) await submit.click();
    else await page.keyboard.press("Enter");

    // Wait for a signed-in signal
    await page.waitForLoadState("networkidle");
    const me = await context.request.get(baseURL + "/api/me", { failOnStatusCode: false });
    if (me.status() !== 200) {
      // Try visiting dashboard, which often requires auth
      await page.goto(baseURL + "/dashboard", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
    }

    await context.storageState({ path: storagePath });
    console.log("Auth storageState written to", storagePath);
  } catch (e) {
    console.warn("[globalSetup] login failed:", e);
    await context.storageState({ path: storagePath }); // still write something
  } finally {
    await browser.close();
  }
}
