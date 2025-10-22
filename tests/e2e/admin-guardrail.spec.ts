// tests/e2e/admin-guardrail.spec.ts
import { test } from "@playwright/test";

test.describe("Admin guardrails", () => {
  test("ADMIN can load /admin/users", async () => {
    // names only
  });

  test("ADMIN can load /admin/listings", async () => {
    // names only
  });

  test("USER is blocked from /admin/users (401/403 or redirected)", async () => {
    // names only
  });

  test("USER is blocked from /admin/listings (401/403 or redirected)", async () => {
    // names only
  });
});
