import { test, expect } from "@playwright/test";

const routes = ["/", "/dashboard", "/messages", "/settings/billing"];

test.describe("No cookie-clearing Set-Cookie on read routes", () => {
  for (const route of routes) {
    test(`GET ${route} does not clear __Secure-next-auth.session-token`, async ({ page }) => {
      const resp = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(resp).toBeTruthy();
      const sc = resp!.headers()["set-cookie"] ?? "";
      expect(sc).not.toMatch(/__Secure-next-auth\.session-token=.*?(Max-Age=0|Expires=Thu, 01 Jan 1970)/i);
    });
  }
});
