// Extend Vitest's Assertion interface with just the matchers we use.
import "vitest";

declare module "vitest" {
  interface Assertion<T = any> {
    toBeInTheDocument(): void;
    toHaveAttribute(attr: string, value?: any): void;
  }
}

export {};
