import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import React from "react";

/** mock next/image -> plain <img> (no JSX so this works in .ts files) */
vi.mock("next/image", () => {
  return {
    __esModule: true,
    default: (props: any) => {
      const { src = "", alt = "", ...rest } = props || {};
      return React.createElement("img", {
        src,
        alt,
        ...rest,
        "data-next-image-mock": true,
      });
    },
  };
});

/** quiet next/navigation if pulled indirectly */
vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<any>("next/navigation");
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
    }),
  };
});

/** matchMedia mock with change dispatch (used by ThemeToggle) */
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => {
    let _matches = false;
    const listeners = new Set<(e: MediaQueryListEvent) => void>();
    const api: any = {
      get matches() {
        return _matches;
      },
      set matches(v: boolean) {
        _matches = v;
      },
      media: query,
      onchange: null,
      addEventListener: (_: "change", cb: any) => listeners.add(cb),
      removeEventListener: (_: "change", cb: any) => listeners.delete(cb),
      addListener: (cb: any) => listeners.add(cb), // legacy
      removeListener: (cb: any) => listeners.delete(cb),
      dispatch(val: boolean) {
        _matches = val;
        const evt = { matches: val, media: query } as MediaQueryListEvent;
        listeners.forEach((cb) => cb(evt));
      },
    };
    return api;
  },
});

/** localStorage shim */
const store = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  value: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
  },
});

/** IntersectionObserver noop */
class IO {
  observe() {}
  disconnect() {}
  unobserve() {}
}
Object.defineProperty(window, "IntersectionObserver", { value: IO });

export {};
