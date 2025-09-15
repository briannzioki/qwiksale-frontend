import { describe, it, expect } from "vitest";

type SuggestionType = "name" | "brand" | "category" | "subcategory" | "service";
type Suggestion = { label: string; value: string; type: SuggestionType };

describe("Suggestion type", () => {
  it("accepts typed items", () => {
    const s: Suggestion = { label: "Samsung", value: "Samsung", type: "brand" };
    expect(s.type).toBe("brand");
  });
});
