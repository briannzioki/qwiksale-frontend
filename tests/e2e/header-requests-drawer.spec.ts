// tests/e2e/header-requests-drawer.spec.ts

import { test, expect, type Page, type Locator } from "@playwright/test";
import { e2ePrisma, e2ePrismaDisconnect } from "./_helpers/prisma";

test.describe.configure({ mode: "serial" });

const prisma = e2ePrisma;

const RUN_ID = `e2e-reqdrawer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

async function ensureE2EAdminUserExists() {
  const email = mustEnv("E2E_ADMIN_EMAIL").toLowerCase();

  // Cast to avoid TS widening issues / index-signature restrictions in strict configs.
  const existing = (await (prisma as any).user.findUnique({
    where: { email },
    select: { id: true },
  })) as { id: string } | null;

  if (!existing?.id) {
    throw new Error(
      `[e2e] Admin user not found for ${email}. ` +
        `Your E2E seed/setup must create it (with the password matching E2E_ADMIN_PASSWORD).`,
    );
  }

  OWNER_ID = existing.id;
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

  const baseData: any = {
    ownerId: OWNER_ID,
    kind: "product",
    title,
    description: "E2E drawer seed",
    location: "Nairobi",
    category: "electronics",
    tags: ["phone"],
    createdAt: now,
    expiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
    boostUntil: new Date(now.getTime() + 60 * 60 * 1000), // 1h boost so it stays at the top
  };

  try {
    const r = await Request.create({
      data: baseData,
      select: { id: true, title: true },
    });

    return r as { id: string; title: string };
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (/PrismaClientValidationError|Unknown argument|Invalid value/i.test(msg)) {
      const { boostUntil, ...fallback } = baseData;
      const r2 = await Request.create({
        data: fallback,
        select: { id: true, title: true },
      });
      return r2 as { id: string; title: string };
    }
    throw e;
  }
}

async function findRequestsTrigger(page: Page): Promise<Locator> {
  const btn = page.getByRole("button", { name: /requests/i });
  if ((await btn.count()) > 0) return btn.first();

  const link = page.getByRole("link", { name: /requests/i });
  if ((await link.count()) > 0) return link.first();

  return page.locator('[aria-label="Requests"], [title="Requests"]').first();
}

async function findDrawer(page: Page): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name: /requests/i });
  if ((await dialog.count()) > 0) return dialog.first();

  const testId = page.locator('[data-testid="requests-drawer"]');
  if ((await testId.count()) > 0) return testId.first();

  const aside = page.locator("aside").filter({ hasText: /requests/i });
  if ((await aside.count()) > 0) return aside.first();

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
  await ensureE2EAdminUserExists();
  await cleanupRunData();
});

test.afterAll(async () => {
  await cleanupRunData();
  await e2ePrismaDisconnect();
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

test("signed-in click opens detail", async ({ browser }) => {
  await cleanupRunData();
  const seeded = await seedRequest(`[${RUN_ID}] Signed-in click item`);

  const adminCtx = await browser.newContext({
    storageState: "tests/e2e/.auth/admin.json",
  });
  const adminPage = await adminCtx.newPage();

  try {
    await adminPage.goto("/");
    const drawer = await openDrawer(adminPage);

    const safeTitle = seeded.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const itemLink = drawer.getByRole("link", { name: new RegExp(safeTitle) });
    await expect(itemLink).toBeVisible();
    await itemLink.click();

    await expect(adminPage).toHaveURL(new RegExp(`/requests/${seeded.id}(?:\\?.*)?$`));
    await expect(adminPage.getByText(seeded.title, { exact: false })).toBeVisible();
  } finally {
    await adminCtx.close();
  }
});
