import React from "react";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import SmartImage from "@/app/components/SmartImage";

describe("SmartImage (smoke)", () => {
  it("renders .svg via <img> with no blur placeholder", () => {
    render(<SmartImage src="/logo.svg" alt="logo" width={64} height={64} />);
    const img = screen.getByAltText("logo");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/logo.svg");
    expect(img).not.toHaveAttribute("placeholder");
    expect(img).not.toHaveAttribute("blurdataurl");
  });

  it("applies blur only when blurDataURL is provided", () => {
    render(
      <SmartImage
        src="/photo.jpg"
        alt="photo"
        width={200}
        height={120}
        placeholder="blur"
        blurDataURL="data:image/png;base64,xxx"
      />
    );
    const img = screen.getByAltText("photo");
    expect(img).toHaveAttribute("placeholder", "blur");
    expect(img).toHaveAttribute("blurdataurl", "data:image/png;base64,xxx");
  });

  it("does not add fetchpriority unless specified", () => {
    render(<SmartImage src="/p.jpg" alt="p" width={40} height={40} />);
    const img = screen.getByAltText("p");
    expect(img).not.toHaveAttribute("fetchpriority");
  });

  it("adds fetchpriority when provided", () => {
    render(<SmartImage src="/hero.jpg" alt="hero" width={800} height={400} fetchPriority="high" />);
    const img = screen.getByAltText("hero");
    expect(img).toHaveAttribute("fetchpriority", "high");
  });
});
