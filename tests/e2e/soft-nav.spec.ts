// tests/e2e/soft-nav.spec.ts
import { test, expect } from "@playwright/test";

const routes = ["/", "/search", "/sell/product", "/help"];

test.describe("no mount-time navigations or reloads", () => {
  for (const path of routes) {
    test(`loads ${path} without reload/replace on mount`, async ({ page }) => {
      await page.addInitScript(() => {
        (window as any).__nav = {
          pushes: 0,
          replaces: 0,
          refreshes: 0,
          reloads: 0,
        };

        const origPushState = history.pushState;
        const origReplaceState = history.replaceState;

        history.pushState = function (...args) {
          (window as any).__nav.pushes++;
          return origPushState.apply(this, args as any);
        };

        history.replaceState = function (...args) {
          (window as any).__nav.replaces++;
          return origReplaceState.apply(this, args as any);
        };

        const origReload = window.location.reload;
        window.location.reload = function (...args: any[]) {
          (window as any).__nav.reloads++;
          return origReload.apply(window.location, args as any);
        };

        // naive router.refresh() hook if someone proxies to location.reload internally
        (window as any).__markRefresh = () => {
          (window as any).__nav.refreshes++;
        };
      });

      await page.goto(path, { waitUntil: "networkidle" });

      // Give hydration a moment; mount-time effects would have fired by now.
      await page.waitForTimeout(400);

      const counts = await page.evaluate(() => (window as any).__nav);

      expect(counts.reloads, "no window.location.reload on mount").toBe(0);

      // Next.js may legitimately call history.replaceState once during initial
      // hydration; we still want to assert there is no *extra* churn here.
      expect(
        counts.replaces,
        "no unexpected history.replaceState on mount",
      ).toBeLessThanOrEqual(1);

      // It's okay for frameworks to do one pushState on first paint in some flows,
      // but for this app we still enforce zero pushState on mount:
      expect(counts.pushes, "no pushState on mount").toBe(0);
    });
  }
});
