// src/app/components/SearchCombobox.tsx
"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type ComboItem<TMeta = unknown> = {
  id: string;
  label: string;
  /** optional metadata you can use onSelect (e.g., type:"brand") */
  meta?: TMeta;
};

type Props<TMeta = unknown> = {
  /** Controlled value (text in the input) */
  value?: string;
  /** Called on every input change OR when an item is chosen */
  onChange?: (v: string) => void;
  /** Called when a specific item is chosen (Enter on an option / click) */
  onSelect?: (item: ComboItem<TMeta>) => void;

  /**
   * If you want the combobox to fully manage fetching, provide this.
   * If you pass `items`, the combobox will render those instead (and skip fetching).
   */
  fetchSuggestions?: (q: string) => Promise<ComboItem<TMeta>[]>;
  /** Provide static/controlled items (takes precedence over fetchSuggestions if passed) */
  items?: ComboItem<TMeta>[];

  placeholder?: string;
  className?: string;

  /** Optional: how many ms to wait before calling fetchSuggestions */
  debounceMs?: number;

  /** Optional custom item renderer */
  renderItem?: (item: ComboItem<TMeta>, active: boolean) => React.ReactNode;

  /** Optional aria-label for the input (if no visible label) */
  ariaLabel?: string;
};

export default function SearchCombobox<TMeta = unknown>({
  value = "",
  onChange,
  onSelect,
  fetchSuggestions,
  items: controlledItems,
  placeholder = "Search…",
  className = "",
  debounceMs = 150,
  renderItem,
  ariaLabel = "Search",
}: Props<TMeta>) {
  const inputId = useId();
  const listId = `${inputId}-listbox`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [q, setQ] = useState(value);
  const [items, setItems] = useState<ComboItem<TMeta>[]>(controlledItems || []);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);

  const activeId = useMemo(
    () => (active != null ? `${listId}-opt-${active}` : undefined),
    [active, listId]
  );

  // keep local input value in sync if parent controls it
  useEffect(() => {
    setQ(value);
  }, [value]);

  // Load suggestions (debounced) only if items not controlled
  useEffect(() => {
    if (controlledItems) {
      setItems(controlledItems);
      return;
    }
    if (!fetchSuggestions) return;

    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    timerRef.current = window.setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetchSuggestions(q);
        setItems(Array.isArray(res) ? res : []);
        setOpen(true);
        setActive(null);
      } catch {
        // ignore
      }
    }, debounceMs) as unknown as number;

    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      abortRef.current?.abort();
    };
  }, [q, fetchSuggestions, controlledItems, debounceMs]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (!items.length) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i == null ? 0 : Math.min(items.length - 1, i + 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i == null ? items.length - 1 : Math.max(0, i - 1)));
    } else if (e.key === "Enter") {
      if (active != null && items[active]) {
        e.preventDefault();
        const chosen = items[active];
        onChange?.(chosen.label);
        onSelect?.(chosen);
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div
      role="combobox"
      aria-expanded={open}
      aria-controls={listId}
      aria-owns={listId}
      aria-haspopup="listbox"
      aria-activedescendant={activeId}
      className={["relative w-full", className].join(" ")}
    >
      <label htmlFor={inputId} className="sr-only">
        {ariaLabel}
      </label>
      <input
        id={inputId}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          onChange?.(e.target.value);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        className="w-full rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-white shadow dark:border-slate-700 dark:bg-slate-900"
        >
          {items.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-500">No suggestions</li>
          )}
          {items.map((it, i) => (
            <li
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              key={it.id}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === active ? "bg-gray-100 dark:bg-slate-800" : ""
              }`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()} // prevent blur before click
              onClick={() => {
                onChange?.(it.label);
                onSelect?.(it);
                setOpen(false);
              }}
            >
              {renderItem ? renderItem(it, i === active) : it.label}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
        Use up/down to navigate, enter to select, escape to dismiss.
      </p>
    </div>
  );
}
