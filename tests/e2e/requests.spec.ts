// tests/e2e/requests.spec.ts

import { test, expect } from "@playwright/test";
import { e2ePrisma, e2ePrismaDisconnect } from "./_helpers/prisma";

test.describe.configure({ mode: "serial" });

const prisma = e2ePrisma;

const RUN_ID = `e2e-requests-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  const expiresAt = args.expiresAt ?? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

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
    },
    select: { id: true, title: true },
  });

  return r as { id: string; title: string };
}

test.beforeAll(async () => {
  await ensureE2EAdminUserExists();
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

  await page.goto("/requests");
  await expect(page.getByRole("heading", { name: /^Requests$/ })).toBeVisible();
  await expect(page.getByText(seeded.title, { exact: false })).toBeVisible();

  const guestCtx = await browser.newContext();
  const guestPage = await guestCtx.newPage();

  await guestPage.goto(`/requests/${encodeURIComponent(seeded.id)}`);
  await expect(guestPage).toHaveURL(/\/signin(\?|$)/);

  const u = new URL(guestPage.url());
  const cb = u.searchParams.get("callbackUrl") || "";
  expect(decodeURIComponent(cb)).toContain(`/requests/${seeded.id}`);

  await guestCtx.close();
});

test("signed-in can open detail", async ({ browser }) => {
  await cleanupRunData();

  const seeded = await seedRequest({
    title: `[${RUN_ID}] Signed-in detail item`,
    kind: "service",
  });

  const adminCtx = await browser.newContext({
    storageState: "tests/e2e/.auth/admin.json",
  });
  const adminPage = await adminCtx.newPage();

  try {
    await adminPage.goto(`/requests/${encodeURIComponent(seeded.id)}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(adminPage).toHaveURL(new RegExp(`/requests/${seeded.id}$`));
    await expect(adminPage.getByText(seeded.title, { exact: false })).toBeVisible();
  } finally {
    await adminCtx.close();
  }
});

test("cap enforced", async ({ browser }) => {
  await cleanupRunData();

  const adminCtx = await browser.newContext({
    storageState: "tests/e2e/.auth/admin.json",
  });
  const adminPage = await adminCtx.newPage();

  try {
    await adminPage.goto("/requests/new", { waitUntil: "domcontentloaded" });

    let firstFailure: { status: number; bodyText: string } | null = null;

    for (let i = 0; i < 20; i++) {
      const title = `[${RUN_ID}] Cap item ${i + 1}`;
      const res = await adminPage.request.post("/api/requests", {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
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

    expect(firstFailure, "Expected request cap/ban/quota to block at least one create").not.toBeNull();

    if (firstFailure) {
      expect([400, 401, 403, 409, 422, 429]).toContain(firstFailure.status);
      expect(firstFailure.bodyText.toLowerCase()).toMatch(
        /limit|cap|quota|ban|too many|blocked|not allowed|forbidden/,
      );
    }
  } finally {
    await adminCtx.close();
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

  const items: any[] = Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];

  expect(items.length).toBeGreaterThanOrEqual(2);

  expect(String(items[0]?.id || "")).toBe(olderBoosted.id);

  const ids = items.map((x) => String(x?.id || ""));
  expect(ids).toContain(newerNotBoosted.id);
});
