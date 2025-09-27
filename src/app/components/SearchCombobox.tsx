// src/app/components/SearchCombobox.tsx
"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

export type ComboItem<TMeta = unknown> = {
  id: string;
  label: string;
  /** optional metadata you can use onSelectAction (e.g., type:"brand") */
  meta?: TMeta;
};

export type Props<TMeta = unknown> = {
  /** Controlled value (text in the input) */
  value?: string;

  /** Called on every input change OR when an item is chosen */
  onChangeAction?: (v: string) => void;

  /** Called when a specific item is chosen (Enter on an option / click) */
  onSelectAction?: (item: ComboItem<TMeta>) => void;

  /**
   * If you want the combobox to fully manage fetching, provide this.
   * If you pass `items`, the combobox will render those instead (and skip fetching).
   */
  fetchSuggestionsAction?: (q: string) => Promise<ComboItem<TMeta>[]>;

  /** Provide static/controlled items (takes precedence over fetchSuggestionsAction if passed) */
  items?: ComboItem<TMeta>[];

  placeholder?: string;
  className?: string;

  /** Optional: how many ms to wait before calling fetchSuggestionsAction */
  debounceMs?: number;

  /** Optional custom item renderer */
  renderItemAction?: (item: ComboItem<TMeta>, active: boolean) => ReactNode;

  /** Optional aria-label for the input (if no visible label) */
  ariaLabel?: string;
};

export default function SearchCombobox<TMeta = unknown>({
  value = "",
  onChangeAction,
  onSelectAction,
  fetchSuggestionsAction,
  items: controlledItems,
  placeholder = "Search…",
  className = "",
  debounceMs = 150,
  renderItemAction,
  ariaLabel = "Search",
}: Props<TMeta>) {
  const inputId = useId();
  const listId = `${inputId}-listbox`;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [q, setQ] = useState(value);
  const [items, setItems] = useState<ComboItem<TMeta>[]>(controlledItems || []);

  // debounce + request race guard
  const timerRef = useRef<number | null>(null);
  const reqTokenRef = useRef(0);

  const activeId = useMemo(
    () => (active != null ? `${listId}-opt-${active}` : undefined),
    [active, listId]
  );

  // keep local input value in sync if parent controls it
  useEffect(() => {
    setQ(value);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Scroll active option into view when navigating with arrows
  useEffect(() => {
    if (!open || active == null) return;
    const el = document.getElementById(`${listId}-opt-${active}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  // Load suggestions (debounced) only if items not controlled
  useEffect(() => {
    if (controlledItems) {
      setItems(controlledItems);
      // show dropdown only if you have something to show
      setOpen(Boolean(controlledItems.length));
      setActive(controlledItems.length ? 0 : null);
      return;
    }
    if (!fetchSuggestionsAction) return;

    // clear previous debounce
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // if query empty, clear items and close list
    if (!q?.trim()) {
      setItems([]);
      setOpen(false);
      setActive(null);
      return;
    }

    const localToken = ++reqTokenRef.current;
    timerRef.current = window.setTimeout(async () => {
      try {
        const res = await fetchSuggestionsAction(q);
        // ignore late responses
        if (localToken !== reqTokenRef.current) return;

        const next = Array.isArray(res) ? res : [];
        setItems(next);
        setOpen(next.length > 0);
        setActive(next.length ? 0 : null);
      } catch {
        // ignore errors but keep list closed
        if (localToken === reqTokenRef.current) {
          setItems([]);
          setOpen(false);
          setActive(null);
        }
      }
    }, Math.max(0, debounceMs)) as unknown as number;

    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [q, fetchSuggestionsAction, controlledItems, debounceMs]);

  const commit = (item: ComboItem<TMeta>) => {
    onChangeAction?.(item.label);
    onSelectAction?.(item);
    setOpen(false);
    // restore focus to input for quick follow-up typing
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(items.length > 0);
      return;
    }

    if (e.key === "Escape") {
      setOpen(false);
      setActive(null);
      return;
    }

    if (!items.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i == null ? 0 : Math.min(items.length - 1, i + 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i == null ? items.length - 1 : Math.max(0, i - 1)));
    } else if (e.key === "Enter") {
      if (active != null && items[active]) {
        e.preventDefault();
        commit(items[active]);
      }
    }
  };

  return (
    <div ref={rootRef} className={["relative w-full", className].join(" ")}>
      <label htmlFor={inputId} className="sr-only">
        {ariaLabel}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          onChangeAction?.(e.target.value);
          // only open if we have something non-empty; actual items will open after fetch
          if (e.target.value.trim()) setOpen(true);
          else setOpen(false);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (items.length) setOpen(true);
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
        // ---- ARIA combobox on the input (recommended) ----
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-activedescendant={activeId}
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
              onMouseDown={(e) => e.preventDefault()} // prevent input blur before click
              onClick={() => commit(it)}
            >
              {renderItemAction ? renderItemAction(it, i === active) : it.label}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
        Use up/down to navigate, Enter to select, Esc to dismiss.
      </p>
    </div>
  );
}
