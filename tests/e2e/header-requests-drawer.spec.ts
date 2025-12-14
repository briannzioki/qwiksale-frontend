// tests/e2e/header-requests-drawer.spec.ts

import { test, expect, type Page, type Locator } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test.describe.configure({ mode: "serial" });

const prisma = new PrismaClient();

const RUN_ID = `e2e-reqdrawer-${Date.now()}-${Math.random()
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

  // Global E2E setup typically ensures this user already exists. Reuse by email to avoid unique(email) collisions.
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
  const Request = getRequestModel();
  await Request.deleteMany({
    where: { title: { startsWith: `[${RUN_ID}]` } },
  });
}

async function seedRequest(title: string) {
  const Request = getRequestModel();

  const now = new Date();
  const r = await Request.create({
    data: {
      ownerId: OWNER_ID,
      kind: "product",
      title,
      description: "E2E drawer seed",
      location: "Nairobi",
      category: "electronics",
      tags: ["phone"],
      createdAt: now,
      expiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      boostUntil: null,
      // Intentionally omit contact fields (avoid enum/name drift).
    },
    select: { id: true, title: true },
  });

  return r as { id: string; title: string };
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
  await expect(page).not.toHaveURL(/\/signin(\?|$)/);
}

async function findRequestsTrigger(page: Page): Promise<Locator> {
  const btn = page.getByRole("button", { name: /requests/i });
  if ((await btn.count()) > 0) return btn.first();

  const link = page.getByRole("link", { name: /requests/i });
  if ((await link.count()) > 0) return link.first();

  // Fallback: any element with aria-label/title "Requests"
  return page.locator('[aria-label="Requests"], [title="Requests"]').first();
}

async function findDrawer(page: Page): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name: /requests/i });
  if ((await dialog.count()) > 0) return dialog.first();

  const testId = page.locator('[data-testid="requests-drawer"]');
  if ((await testId.count()) > 0) return testId.first();

  const aside = page.locator("aside").filter({ hasText: /requests/i });
  if ((await aside.count()) > 0) return aside.first();

  // Last resort: any panel containing at least one /requests/... link.
  return page
    .locator('div:has-text("Requests")')
    .filter({ has: page.locator("a[href^='/requests/']") })
    .first();
}

async function openDrawer(page: Page) {
  const trigger = await findRequestsTrigger(page);
  await expect(trigger).toBeVisible();
  await trigger.click();

  const drawer = await findDrawer(page);
  await expect(drawer).toBeVisible();
  return drawer;
}

test.beforeAll(async () => {
  await ensureE2EAdminUser();
  await cleanupRunData();
});

test.afterAll(async () => {
  await cleanupRunData();
  await prisma.$disconnect();
});

test("drawer opens", async ({ page }) => {
  await cleanupRunData();
  await seedRequest(`[${RUN_ID}] Drawer item`);

  await page.goto("/");
  await openDrawer(page);
});

test("shows latest", async ({ page }) => {
  await cleanupRunData();
  const seeded = await seedRequest(`[${RUN_ID}] Latest drawer item`);

  await page.goto("/");
  const drawer = await openDrawer(page);

  await expect(drawer.getByText(seeded.title, { exact: false })).toBeVisible();
});

test("guest click redirects to signin", async ({ page }) => {
  await cleanupRunData();
  const seeded = await seedRequest(`[${RUN_ID}] Guest click item`);

  await page.goto("/");
  const drawer = await openDrawer(page);

  const safeTitle = seeded.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const itemLink = drawer.getByRole("link", { name: new RegExp(safeTitle) });
  await expect(itemLink).toBeVisible();
  await itemLink.click();

  await expect(page).toHaveURL(/\/signin(\?|$)/);

  const u = new URL(page.url());
  const cb = u.searchParams.get("callbackUrl") || "";
  expect(decodeURIComponent(cb)).toContain(`/requests/${seeded.id}`);
});

test("signed-in click opens detail", async ({ page }) => {
  await cleanupRunData();
  const seeded = await seedRequest(`[${RUN_ID}] Signed-in click item`);

  await signInAsE2EAdmin(page, "/");
  await page.goto("/");

  const drawer = await openDrawer(page);

  const safeTitle = seeded.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const itemLink = drawer.getByRole("link", { name: new RegExp(safeTitle) });
  await expect(itemLink).toBeVisible();
  await itemLink.click();

  await expect(page).toHaveURL(new RegExp(`/requests/${seeded.id}$`));
  await expect(page.getByText(seeded.title, { exact: false })).toBeVisible();
});
