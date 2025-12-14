// tests/integration/api.dashboard-summary.spec.ts
import { describe, it, expect } from "vitest";

const BASE_URL =
  process.env["TEST_BASE_URL"] ??
  process.env["BASE_URL"] ??
  "http://127.0.0.1:3000";

describe("API: /api/dashboard/summary", () => {
  it("requires authentication", async () => {
    const res = await fetch(`${BASE_URL}/api/dashboard/summary`, {
      headers: { accept: "application/json" },
    });

    // Route should be protected
    expect(res.status).toBe(401);

    const body = (await res.json().catch(() => null)) as
      | { error?: unknown }
      | null;

    expect(body).not.toBeNull();
    if (body) {
      expect(typeof body.error === "string" || body.error === undefined).toBe(
        true,
      );
    }
  });

  // You can later wire a second test here that:
  // - sets up an authenticated request (cookies / header),
  // - hits /api/dashboard/summary,
  // - and asserts the metrics/inbox/recentListings shape for a seeded user.
});
