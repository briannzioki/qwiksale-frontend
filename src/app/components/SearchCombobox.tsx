"use client";
// src/app/components/SearchCombobox.tsx

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

export type ComboItem<TMeta = unknown> = {
  id: string;
  label: string;
  meta?: TMeta;
};

export type Props<TMeta = unknown> = {
  value?: string;
  onChangeAction?: (v: string) => void;
  onSelectAction?: (item: ComboItem<TMeta>) => void;
  fetchSuggestionsAction?: (q: string) => Promise<ComboItem<TMeta>[]>;
  items?: ComboItem<TMeta>[];
  placeholder?: string;
  className?: string;
  debounceMs?: number;
  renderItemAction?: (item: ComboItem<TMeta>, active: boolean) => ReactNode;
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
  const [items, setItems] = useState<ComboItem<TMeta>[]>(
    controlledItems || []
  );

  const timerRef = useRef<number | null>(null);
  const reqTokenRef = useRef(0);

  const activeId = useMemo(
    () => (active != null ? `${listId}-opt-${active}` : undefined),
    [active, listId]
  );

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

  // Scroll active option into view
  useEffect(() => {
    if (!open || active == null) return;
    const el = document.getElementById(`${listId}-opt-${active}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  // Suggestions (debounced) when not controlled via `items`
  useEffect(() => {
    if (controlledItems) {
      setItems(controlledItems);
      setOpen(Boolean(controlledItems.length));
      setActive(controlledItems.length ? 0 : null);
      return;
    }
    if (!fetchSuggestionsAction) return;

    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

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
        if (localToken !== reqTokenRef.current) return;

        const next = Array.isArray(res) ? res : [];
        setItems(next);
        setOpen(next.length > 0);
        setActive(next.length ? 0 : null);
      } catch {
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
    inputRef.current?.focus();

    // If no explicit onSelectAction is provided, treat as a search submit:
    if (!onSelectAction && typeof window !== "undefined") {
      const term = item.label.trim();
      if (term) {
        window.location.href = `/search?q=${encodeURIComponent(term)}`;
      }
    }
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

    if (e.key === "Enter") {
      // If a suggestion is active, select it.
      if (active != null && items[active]) {
        e.preventDefault();
        commit(items[active]);
        return;
      }
      // Otherwise, interpret as a search submit using `q` → /search?q=...
      const term = q.trim();
      if (term) {
        e.preventDefault();
        if (onSelectAction) {
          onSelectAction({ id: term, label: term } as ComboItem<TMeta>);
        } else if (typeof window !== "undefined") {
          window.location.href = `/search?q=${encodeURIComponent(
            term
          )}`;
        }
        setOpen(false);
      }
      return;
    }

    if (!items.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) =>
        i == null ? 0 : Math.min(items.length - 1, i + 1)
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) =>
        i == null ? items.length - 1 : Math.max(0, i - 1)
      );
    }
  };

  return (
    <div
      ref={rootRef}
      className={["relative w-full", className].join(" ")}
    >
      <label htmlFor={inputId} className="sr-only">
        {ariaLabel}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        value={q}
        onChange={(e) => {
          const next = e.target.value;
          setQ(next);
          onChangeAction?.(next);
          setOpen(Boolean(next.trim()) && items.length > 0);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (items.length) setOpen(true);
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brandBlue dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
        spellCheck
        autoCorrect="on"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-activedescendant={activeId}
        aria-label={ariaLabel}
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-md dark:border-white/10 dark:bg-slate-900"
        >
          {items.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-500 dark:text-slate-400">
              No suggestions
            </li>
          )}
          {items.map((it, i) => (
            <li
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              key={it.id}
              className={`cursor-pointer px-3 py-2 text-sm text-gray-800 dark:text-slate-100 ${
                i === active
                  ? "bg-gray-100 dark:bg-slate-800"
                  : "bg-transparent"
              }`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(it)}
            >
              {renderItemAction
                ? renderItemAction(it, i === active)
                : it.label}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
        Use ↑/↓ to navigate, Enter to select or search, Esc to dismiss.
      </p>
    </div>
  );
}
