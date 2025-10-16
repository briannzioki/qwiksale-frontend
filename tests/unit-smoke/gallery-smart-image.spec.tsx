import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import Gallery from "@/app/components/Gallery";

describe("Gallery + SmartImage (smoke)", () => {
  it("renders a positioned wrapper when using fill", () => {
    const { container } = render(<Gallery images={["/img/a.jpg"]} lightbox={false} />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    const parent = img!.parentElement!;
    const style = getComputedStyle(parent as any);
    expect(["relative", "absolute", "fixed"]).toContain(style.position);
  });
});
