import React from "react";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThemeToggle from "@/app/components/ThemeToggle";

/** Persistent matchMedia mock: same MQL object per query, emits “change”. */
function installMatchMediaMock() {
  type CB = (e: MediaQueryListEvent) => void;

  const listeners = new Map<string, Set<CB>>();
  const states = new Map<string, boolean>();
  const mqlMap = new Map<string, MediaQueryList>();

  function ensure(query: string) {
    if (!listeners.has(query)) listeners.set(query, new Set());
    if (!states.has(query)) states.set(query, false);
    if (!mqlMap.has(query)) {
      const mql: MediaQueryList = {
        get matches() {
          return !!states.get(query);
        },
        media: query,
        onchange: null,
        addEventListener: (_t: "change", cb: CB) => listeners.get(query)!.add(cb),
        removeEventListener: (_t: "change", cb: CB) => listeners.get(query)!.delete(cb),
        // legacy methods some libs still call
        addListener: (cb: CB) => listeners.get(query)!.add(cb),
        removeListener: (cb: CB) => listeners.get(query)!.delete(cb),
        dispatchEvent: (ev: Event) => {
          listeners.get(query)!.forEach((cb) => cb(ev as MediaQueryListEvent));
          return true;
        },
      } as unknown as MediaQueryList;
      mqlMap.set(query, mql);
    }
  }

  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
    ensure(query);
    return mqlMap.get(query)!;
  });

  return {
    setDark(val: boolean) {
      const q = "(prefers-color-scheme: dark)";
      ensure(q);
      states.set(q, val);
      mqlMap.get(q)!.dispatchEvent(new Event("change"));
    },
  };
}

function isDark(): boolean {
  const html = document.documentElement;
  // support either a class toggle or a color-scheme inline style/attr
  if (html.classList.contains("dark")) return true;
  const inline = (html.style as any).colorScheme || html.style.getPropertyValue("color-scheme");
  if (inline === "dark") return true;
  if (html.getAttribute("data-theme") === "dark") return true;
  if (html.getAttribute("data-theme-mode") === "dark") return true;
  return false;
}

describe("ThemeToggle (smoke)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-mode");
    (document.documentElement.style as any).colorScheme = "";
    vi.restoreAllMocks();
  });

  it("switches light and dark and persists", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const btn = screen.getByRole("button"); // single cycling button

    await user.click(btn); // -> light
    await waitFor(() => expect(window.localStorage.getItem("theme")).toBe("light"));
    expect(isDark()).toBe(false);

    await user.click(btn); // -> dark
    await waitFor(() => expect(window.localStorage.getItem("theme")).toBe("dark"));
    expect(isDark()).toBe(true);
  });

  it("system mode follows OS and reacts to changes", async () => {
    const mm = installMatchMediaMock();

    // Start in “system” so component subscribes to MQL on mount.
    window.localStorage.setItem("theme", "system");
    render(<ThemeToggle />);

    mm.setDark(true);
    await waitFor(() => expect(isDark()).toBe(true));

    mm.setDark(false);
    await waitFor(() => expect(isDark()).toBe(false));
  });

  it("syncs with storage events from other tabs", async () => {
    render(<ThemeToggle />);
    window.localStorage.setItem("theme", "dark");
    window.dispatchEvent(new StorageEvent("storage", { key: "theme", newValue: "dark" }));
    await waitFor(() => expect(isDark()).toBe(true));
  });
});
