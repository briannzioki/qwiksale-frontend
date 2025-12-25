// tests/e2e/requests.spec.ts

import { test, expect, type Page } from "@playwright/test";
import { e2ePrisma, e2ePrismaDisconnect } from "./_helpers/prisma";

test.describe.configure({ mode: "serial" });

const prisma = e2ePrisma;

const RUN_ID = `e2e-requests-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;
let OWNER_ID = "e2e-admin";

type RequestModel = {
  create: (args: any) => Promise<any>;
  deleteMany: (args: any) => Promise<{ count: number }>;
};

function getRequestModel(): RequestModel {
  const m = (prisma as any)?.request;
  if (!m) {
    throw new Error(
      "[e2e] Prisma client does not expose model `request`. Run: pnpm prisma generate (after migrating schema).",
    );
  }
  return m as RequestModel;
}

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[e2e] Missing env ${name}`);
  return v;
}

async function ensureE2EAdminUser() {
  const email = mustEnv("E2E_ADMIN_EMAIL").toLowerCase();

  // Global E2E setup typically ensures this user already exists.
  // Reuse by email to avoid unique(email) collisions.
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing?.id) {
    OWNER_ID = existing.id;
    return;
  }

  // Fallback: create if missing (do NOT force a fixed id).
  const created = await prisma.user.create({
    data: {
      email,
      role: "ADMIN",
      subscription: "BASIC",
      suspended: false,
      banned: false,
      verified: true,
      username: "e2e-admin",
      name: "E2E Admin",
    },
    select: { id: true },
  });

  OWNER_ID = created.id;
}

async function cleanupRunData() {
  // Only delete Requests created by this file run.
  const Request = getRequestModel();
  await Request.deleteMany({
    where: { title: { startsWith: `[${RUN_ID}]` } },
  });
}

async function signInAsE2EAdmin(page: Page, callbackUrl = "/") {
  const email = mustEnv("E2E_ADMIN_EMAIL");
  const password = mustEnv("E2E_ADMIN_PASSWORD");

  await page.goto(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);

  const emailInput =
    (await page.getByLabel(/email/i).count()) > 0
      ? page.getByLabel(/email/i)
      : page.locator('input[type="email"]');

  const passInput =
    (await page.getByLabel(/^password$/i).count()) > 0
      ? page.getByLabel(/^password$/i)
      : page.locator('input[type="password"]');

  await expect(emailInput).toBeVisible();
  await expect(passInput).toBeVisible();

  await emailInput.fill(email);
  await passInput.fill(password);

  const btn =
    (await page.getByRole("button", { name: /sign in/i }).count()) > 0
      ? page.getByRole("button", { name: /sign in/i })
      : page.getByRole("button", { name: /log in/i });

  await btn.click();

  // Successful auth should land back on callbackUrl (or at least leave /signin).
  await expect(page).not.toHaveURL(/\/signin(\?|$)/);
}

async function cookieHeaderForPageOrigin(page: Page): Promise<string> {
  const origin = new URL(page.url()).origin;
  const jar = await page.context().cookies([origin]);
  return jar.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function seedRequest(args: {
  title: string;
  kind: "product" | "service";
  createdAt?: Date;
  expiresAt?: Date;
  boostUntil?: Date | null;
}) {
  const Request = getRequestModel();

  const now = new Date();
  const createdAt = args.createdAt ?? now;
  const expiresAt =
    args.expiresAt ?? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  // Keep the seed payload minimal and tolerant of schema evolution.
  const r = await Request.create({
    data: {
      ownerId: OWNER_ID,
      kind: args.kind,
      title: args.title,
      description: "E2E seeded request",
      location: "Nairobi",
      category: "electronics",
      tags: ["phone"],
      createdAt,
      expiresAt,
      boostUntil: args.boostUntil ?? null,
      // Intentionally omit contact fields (avoid enum/name drift).
    },
    select: { id: true, title: true },
  });

  return r as { id: string; title: string };
}

test.beforeAll(async () => {
  await ensureE2EAdminUser();
  await cleanupRunData();
});

test.afterAll(async () => {
  await cleanupRunData();
  await e2ePrismaDisconnect();
});

test("guest can see list, cannot open detail", async ({ page, browser }) => {
  await cleanupRunData();

  const seeded = await seedRequest({
    title: `[${RUN_ID}] Guest list item`,
    kind: "product",
  });

  // Guest can see list (public-safe)
  await page.goto("/requests");
  await expect(page.getByRole("heading", { name: /^Requests$/ })).toBeVisible();
  await expect(page.getByText(seeded.title, { exact: false })).toBeVisible();

  // Guest cannot open detail (auth-gated page should redirect before 404)
  const guestCtx = await browser.newContext();
  const guestPage = await guestCtx.newPage();

  await guestPage.goto(`/requests/${encodeURIComponent(seeded.id)}`);
  await expect(guestPage).toHaveURL(/\/signin(\?|$)/);

  const u = new URL(guestPage.url());
  const cb = u.searchParams.get("callbackUrl") || "";
  expect(decodeURIComponent(cb)).toContain(`/requests/${seeded.id}`);

  await guestCtx.close();
});

test("signed-in can open detail", async ({ page }) => {
  await cleanupRunData();

  const seeded = await seedRequest({
    title: `[${RUN_ID}] Signed-in detail item`,
    kind: "service",
  });

  await signInAsE2EAdmin(page, `/requests/${seeded.id}`);

  // Must not bounce to signin once authed.
  await expect(page).toHaveURL(new RegExp(`/requests/${seeded.id}$`));
  await expect(page.getByText(seeded.title, { exact: false })).toBeVisible();
});

test("cap enforced", async ({ page }) => {
  await cleanupRunData();

  await signInAsE2EAdmin(page, "/requests/new");

  // Build a Cookie header explicitly so API calls are guaranteed to be authenticated.
  const cookieHeader = await cookieHeaderForPageOrigin(page);
  expect(cookieHeader, "Expected auth cookies after signing in").not.toBe("");

  let firstFailure: { status: number; bodyText: string } | null = null;

  // Intentionally "over-create" to hit caps across tiers/limits.
  for (let i = 0; i < 20; i++) {
    const title = `[${RUN_ID}] Cap item ${i + 1}`;
    const res = await page.request.post("/api/requests", {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: cookieHeader,
      },
      data: {
        kind: "product",
        title,
        description: "E2E cap test",
        location: "Nairobi",
        category: "electronics",
        tags: ["phone"],
        contactEnabled: false,
        contactMode: null,
      },
    });

    if (!res.ok()) {
      firstFailure = { status: res.status(), bodyText: await res.text() };
      break;
    }
  }

  expect(
    firstFailure,
    "Expected request cap/ban/quota to block at least one create",
  ).not.toBeNull();

  if (firstFailure) {
    expect([400, 401, 403, 409, 422, 429]).toContain(firstFailure.status);
    expect(firstFailure.bodyText.toLowerCase()).toMatch(
      /limit|cap|quota|ban|too many|blocked|not allowed|forbidden/,
    );
  }
});

test("expiry respected", async ({ page }) => {
  await cleanupRunData();

  const now = new Date();
  const expired = await seedRequest({
    title: `[${RUN_ID}] Expired item`,
    kind: "product",
    expiresAt: new Date(now.getTime() - 60 * 1000),
  });

  const active = await seedRequest({
    title: `[${RUN_ID}] Active item`,
    kind: "product",
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
  });

  await page.goto("/requests");

  // Active should be visible; expired should not (filtered or clearly marked removed).
  await expect(page.getByText(active.title, { exact: false })).toBeVisible();
  await expect(page.getByText(expired.title, { exact: false })).toHaveCount(0);
});

test("boost ordering respected", async ({ page }) => {
  await cleanupRunData();

  const now = new Date();

  const olderBoosted = await seedRequest({
    title: `[${RUN_ID}] Boosted older`,
    kind: "product",
    createdAt: new Date(now.getTime() - 60 * 60 * 1000),
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    boostUntil: new Date(now.getTime() + 6 * 60 * 60 * 1000),
  });

  const newerNotBoosted = await seedRequest({
    title: `[${RUN_ID}] Newer not boosted`,
    kind: "product",
    createdAt: new Date(now.getTime() - 5 * 60 * 1000),
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    boostUntil: null,
  });

  const res = await page.request.get("/api/requests/feed", {
    headers: { Accept: "application/json" },
  });

  expect(res.ok()).toBeTruthy();
  const json = (await res.json()) as any;

  const items: any[] = Array.isArray(json?.items)
    ? json.items
    : Array.isArray(json)
      ? json
      : [];

  expect(items.length).toBeGreaterThanOrEqual(2);

  // Boosted must float to the top even if older.
  expect(String(items[0]?.id || "")).toBe(olderBoosted.id);

  // Ensure the other one is still present.
  const ids = items.map((x) => String(x?.id || ""));
  expect(ids).toContain(newerNotBoosted.id);
});
