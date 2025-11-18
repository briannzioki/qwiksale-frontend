// tests/unit/url.spec.ts
import { describe, it, expect } from "vitest";
import { buildSearchHref } from "@/app/lib/url";

describe("buildSearchHref", () => {
  it("builds bare /search", () => {
    expect(buildSearchHref()).toBe("/search");
  });
  it("adds q if provided", () => {
    expect(buildSearchHref("  iphone  ")).toBe("/search?q=iphone");
  });
  it("includes typed filters minimally", () => {
    expect(buildSearchHref({ q: "mix", type: "product" })).toBe("/search?type=product&q=mix");
    expect(buildSearchHref({ q: "spa", type: "service" })).toBe("/search?type=service&q=spa");
    expect(buildSearchHref({ brand: "Samsung" })).toBe("/search?brand=Samsung");
    expect(buildSearchHref({ category: "Phones", subcategory: "Android" })).toBe(
      "/search?category=Phones&subcategory=Android"
    );
  });
});
