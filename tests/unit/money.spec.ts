import { describe, it, expect } from "vitest";

function fmtKES(n?: number | null) {
  if (typeof n !== "number" || n <= 0) return "Contact for quote";
  try {
    return `KES ${new Intl.NumberFormat("en-KE").format(n)}`;
  } catch {
    return `KES ${n}`;
  }
}

describe("fmtKES", () => {
  it("formats positive numbers", () => {
    expect(fmtKES(123456)).toMatch(/KES\s+123,456/);
  });
  it("falls back for zero or undefined", () => {
    expect(fmtKES(0)).toBe("Contact for quote");
    expect(fmtKES(undefined)).toBe("Contact for quote");
  });
});
