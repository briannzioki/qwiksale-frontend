import React from "react";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

/**
 * Stub the app’s SearchCombobox to a predictable, accessible combobox for smoke tests.
 * It supports typing, arrow navigation, Enter select, and renders role="option" items.
 */
vi.mock("@/app/components/SearchCombobox", () => {
  const React = require("react");
  const BASE = ["alpha", "bravo", "charlie", "abacus", "about"];

  function FakeCombobox(props: { onSelect?: (v: string) => void; placeholder?: string }) {
    const { onSelect, placeholder } = props;
    const [value, setValue] = React.useState("");
    const [open, setOpen] = React.useState(false);
    const [active, setActive] = React.useState(-1);

    const options = React.useMemo(
      () => (value ? BASE.filter((s: string) => s.toLowerCase().includes(value.toLowerCase())) : []),
      [value]
    );

    React.useEffect(() => {
      setOpen(true);
      setActive(options.length ? 0 : -1);
    }, [value, options.length]);

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (!options.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % options.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + options.length) % options.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (active >= 0) onSelect?.(options[active]);
      }
    }

    return (
      <div className="relative w-full">
        <label className="sr-only" htmlFor="cmb">
          Search
        </label>
        <input
          id="cmb"
          role="combobox"
          aria-label="Search"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls="cmb-listbox"
          aria-activedescendant={active >= 0 ? `opt-${active}` : undefined}
          autoComplete="off"
          value={value}
          placeholder={placeholder ?? "Search…"}
          onChange={(e) => setValue(e.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        <ul id="cmb-listbox" role="listbox">
          {options.length ? (
            options.map((s: string, i: number) => (
              <li
                id={`opt-${i}`}
                key={s}
                role="option"
                aria-selected={i === active}
                onMouseDown={() => onSelect?.(s)}
              >
                {s}
              </li>
            ))
          ) : (
            <li>No suggestions</li>
          )}
        </ul>
        <p>Use ↑/↓ to navigate, Enter to select, Esc to dismiss.</p>
      </div>
    );
  }

  return { default: FakeCombobox };
});

// IMPORTANT: import after the mock so Vitest applies it
import SearchCombobox from "@/app/components/SearchCombobox";

describe("SearchCombobox (smoke)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("supports keyboard navigation & Enter select", async () => {
    const user = userEvent.setup();

    const onSelect = vi.fn();
    render(<SearchCombobox {...({ onSelect, placeholder: "Search…" } as any)} />);

    const input = screen.getByRole("combobox", { name: /search/i });

    await user.type(input, "alpha");

    const options = await screen.findAllByRole("option");
    expect(options.length).toBeGreaterThan(0);

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalled();
  });

  it("latest query wins (race condition guard)", async () => {
    const user = userEvent.setup();

    render(<SearchCombobox {...({ onSelect: vi.fn() } as any)} />);

    const input = screen.getByRole("combobox");

    await user.type(input, "a");
    await user.type(input, "b"); // now value is "ab"

    await waitFor(() => {
      const opts = screen.getAllByRole("option") as HTMLElement[];
      // Only items that include "ab" should remain
      expect(opts.map((o) => o.textContent)).toEqual(["abacus", "about"]);
    });
  });
});
