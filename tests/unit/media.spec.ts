import { describe, it, expect } from "vitest";
import {
  hasRichMedia,
  extractGalleryUrls,
  stripPlaceholderIfOthers,
  isRenderableImageUrl,
} from "../../src/app/lib/media";

const PH = "/placeholder/default.jpg";

describe("media helpers", () => {
  it("prefers API gallery over other legacy fields", () => {
    const obj = {
      gallery: ["https://a/1.jpg", "https://a/2.jpg"],
      imageUrls: ["https://b/3.jpg", "https://b/4.jpg"],
    };
    const urls = extractGalleryUrls(obj);
    expect(urls.slice(0, 2)).toEqual(obj.gallery);
  });

  it("handles object-shaped URLs", () => {
    const obj = {
      images: [{ url: "https://x/1.jpg" }, { secureUrl: "https://x/2.jpg" }, { src: "https://x/3.jpg" }],
    };
    const urls = extractGalleryUrls(obj);
    expect(urls.length).toBe(3);
    expect(urls.every(isRenderableImageUrl)).toBe(true);
  });

  it("hasRichMedia flags true when >=2 valid URLs exist", () => {
    expect(hasRichMedia({ gallery: ["https://a/1.jpg", "https://a/2.jpg"] })).toBe(true);
    expect(hasRichMedia({ gallery: ["https://a/1.jpg"] })).toBe(false);
  });

  it("stripPlaceholderIfOthers removes placeholder only when real images exist", () => {
    expect(stripPlaceholderIfOthers([PH, "https://a/1.jpg"], PH)).toEqual(["https://a/1.jpg"]);
    expect(stripPlaceholderIfOthers([PH], PH)).toEqual([PH]);
  });
});
