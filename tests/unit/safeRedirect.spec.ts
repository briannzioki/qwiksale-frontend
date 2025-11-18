// tests/unit/safeRedirect.spec.ts
import { describe, it, expect, vi } from "vitest";

// mock next/navigation redirect so we can assert calls
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import {
  normalizePathAndQuery,
  samePathAndQuery,
  redirectIfDifferent,
} from "@/app/lib/safeRedirect";
import { redirect } from "next/navigation";

describe("safeRedirect utilities", () => {
  it("normalizePathAndQuery strips origin/hash, sorts params & drops empties", () => {
    const inUrl = new URL("https://example.com/search?b=2&a=1&empty=#hash");
    expect(normalizePathAndQuery(inUrl)).toBe("/search?a=1&b=2");
  });

  it("samePathAndQuery detects equivalence", () => {
    expect(samePathAndQuery("/x?a=1&b=2", "/x?b=2&a=1")).toBe(true);
    expect(samePathAndQuery("/x", "/x/")).toBe(true);
    expect(samePathAndQuery("/x", "/y")).toBe(false);
  });

  it("redirectIfDifferent no-ops for equivalent paths", () => {
    redirectIfDifferent("/x?a=1&b=2", "/x?b=2&a=1");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirectIfDifferent triggers redirect for different paths", () => {
    redirectIfDifferent("/y", "/x");
    expect(redirect).toHaveBeenCalledWith("/y");
  });
});
