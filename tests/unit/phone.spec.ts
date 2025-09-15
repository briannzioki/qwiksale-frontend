import { describe, it, expect } from "vitest";

// If normalizeKenyanMsisdn isn't exported anywhere yet, consider exporting it from ContactModal or a shared util.
// For now, paste a local copy identical to your app logic to validate behavior.
function normalizeKenyanMsisdn(raw?: string | null): string | null {
  if (!raw) return null;
  let s = String(raw).trim();

  if (/^\+?254(7|1)\d{8}$/.test(s)) return s.replace(/^\+/, "");
  s = s.replace(/\D+/g, "");

  if (/^07\d{8}$/.test(s) || /^01\d{8}$/.test(s)) return "254" + s.slice(1);
  if (/^(7|1)\d{8}$/.test(s)) return "254" + s;
  if (s.startsWith("254") && s.length >= 12) return s.slice(0, 12);

  return null;
}

describe("normalizeKenyanMsisdn", () => {
  it("handles +2547xxxxxxxx", () => {
    expect(normalizeKenyanMsisdn("+254712345678")).toBe("254712345678");
  });
  it("handles 07xxxxxxxx", () => {
    expect(normalizeKenyanMsisdn("0712345678")).toBe("254712345678");
  });
  it("handles 7xxxxxxxx", () => {
    expect(normalizeKenyanMsisdn("712345678")).toBe("254712345678");
  });
  it("rejects invalid", () => {
    expect(normalizeKenyanMsisdn("123")).toBeNull();
  });
});
