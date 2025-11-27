// tests/e2e/csp.spec.ts
import { test, expect } from "@playwright/test";

const REQUIRED_CONNECT_SRC = [
  "https://api.cloudinary.com",
  "https://res.cloudinary.com",
  "https://api.resend.com",
  "https://api.africastalking.com",
  "https://api.sandbox.africastalking.com",
  "https://vitals.vercel-insights.com",
  "https://vitals.vercel-analytics.com",
  "https://plausible.io",
  "https://www.google-analytics.com",
  "https://region1.google-analytics.com",
  "ws:",
  "wss:",
];

const REQUIRED_IMG_SRC = [
  "https://res.cloudinary.com",
  "https://lh3.googleusercontent.com",
  "https://images.unsplash.com",
  "https://plus.unsplash.com",
  "https://avatars.githubusercontent.com",
  "https://images.pexels.com",
  "https://picsum.photos",
];

// Safe wrapper because header may be undefined
function normalizeCSP(csp: string | undefined | null): string[] {
  if (!csp) return [];
  return csp
    .split(";")
    .map((e) => e.trim())
    .filter(Boolean);
}

function getDirective(cspList: string[], name: string): string[] {
  const raw = cspList.find((d) => d.startsWith(name));
  if (!raw) return [];
  return raw.replace(`${name} `, "").split(/\s+/);
}

test.describe("Content-Security-Policy", () => {
  test("CSP header is present on HTML responses", async ({ page }) => {
    const res = await page.goto("/");
    const csp =
      res?.headers()["content-security-policy"] ||
      res?.headers()["content-security-policy-report-only"];
    expect(csp, "CSP header must exist").toBeTruthy();
  });

  test("connect-src contains all required integrations", async ({ page }) => {
    const res = await page.goto("/");
    const cspRaw =
      res?.headers()["content-security-policy"] ||
      res?.headers()["content-security-policy-report-only"];
    const csp = normalizeCSP(cspRaw);

    const connect = getDirective(csp, "connect-src");

    for (const url of REQUIRED_CONNECT_SRC) {
      expect(
        connect.some((e) => e.startsWith(url)),
        `Missing connect-src: ${url}`
      ).toBeTruthy();
    }
  });

  test("img-src contains all required CDNs", async ({ page }) => {
    const res = await page.goto("/");
    const cspRaw =
      res?.headers()["content-security-policy"] ||
      res?.headers()["content-security-policy-report-only"];
    const csp = normalizeCSP(cspRaw);

    const imgs = getDirective(csp, "img-src");

    for (const url of REQUIRED_IMG_SRC) {
      expect(
        imgs.some((e) => e.startsWith(url)),
        `Missing img-src: ${url}`
      ).toBeTruthy();
    }
  });

  test("Cloudinary upload API succeeds under CSP", async ({ page }) => {
    // Tiny 1x1 PNG
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=";

    // Extract base64 safely
    const base64 = dataUrl.split(",")[1] ?? "";
    const fileBuffer = Buffer.from(base64, "base64");

    // Env narrowing (fixes TS2345, TS4111)
    const cloudName = process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] ?? "";
    const uploadPreset =
      process.env["NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET"] ??
      process.env["CLOUDINARY_UPLOAD_PRESET"] ??
      "";

    test.skip(!cloudName || !uploadPreset, "Cloudinary disabled in environment");

    const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;

    const res = await page.request.post(endpoint, {
      multipart: {
        file: {
          name: "test.png",
          mimeType: "image/png",
          buffer: fileBuffer,
        },
        upload_preset: uploadPreset,
      },
    });

    expect(res.status(), "Cloudinary blocked by CSP").toBeLessThan(400);

    const json = await res.json();
    expect(json.secure_url, "Missing secure_url").toBeTruthy();
  });

  test("favicon is served correctly (regression test)", async ({ page }) => {
    const fav = await page.request.get("/favicon/favicon-32x32.png");
    expect(fav.status()).toBe(200);

    const big = await page.request.get("/favicon/android-chrome-512x512.png");
    expect(big.status()).toBe(200);
  });

  test("middleware CSP contains required directives", async ({ page }) => {
    const res = await page.goto("/");
    const headerCsp =
      res?.headers()["content-security-policy"] ||
      res?.headers()["content-security-policy-report-only"];

    expect(headerCsp).toBeTruthy();

    const parsed = normalizeCSP(headerCsp);
    const requiredDirectives = ["connect-src", "img-src", "style-src"];

    for (const dir of requiredDirectives) {
      const exists = parsed.some((line) => line.startsWith(dir));
      expect(exists, `Missing directive: ${dir}`).toBeTruthy();
    }
  });
});
