import { describe, it, expect } from "vitest";

describe("GET /api/services/:id", () => {
  it("returns a gallery array and sane headers", async () => {
    const id = process.env['TEST_SERVICE_ID']; // or discover on / in e2e
    if (!id) return;

    const r = await fetch(`http://localhost:3000/api/services/${id}`, { cache: "no-store" });
    expect(r.ok).toBeTruthy();
    expect(r.headers.get("vary")?.toLowerCase()).toContain("authorization");
    const j = await r.json();
    expect(Array.isArray(j.gallery)).toBe(true);
  });
});
