import { test, expect } from "@playwright/test";

test("Dashboard SSR: no 5xx, capture diagnostics on failure", async ({ page }) => {
  // Surface console + pageerror to the test runner output
  page.on("console", (msg) => {
    // eslint-disable-next-line no-console
    console.log(`[dashboard console:${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    // eslint-disable-next-line no-console
    console.log(`[dashboard pageerror] ${err?.message || String(err)}`);
  });

  const resp = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  expect(resp).toBeTruthy();

  const status = resp!.status();
  const headers = resp!.headers();
  // Log a few headers that help debug where it failed
  // eslint-disable-next-line no-console
  console.log("status:", status, {
    "cache-control": headers["cache-control"],
    "x-vercel-id": headers["x-vercel-id"],
    "x-powered-by": headers["x-powered-by"],
    "content-type": headers["content-type"],
  });

  if (status >= 500) {
    // Grab the raw HTML to look for clues
    const html = await resp!.text();
    // eslint-disable-next-line no-console
    console.log("---- BEGIN DASHBOARD HTML (first 2KB) ----");
    // print only a slice so logs stay readable
    console.log(html.slice(0, 2048));
    console.log("---- END DASHBOARD HTML ----");
  }

  expect(status).toBeLessThan(500);
  const htmlNow = await page.content();
  expect(htmlNow).not.toMatch(/__next_error__|Application error|500 Internal/i);
});
