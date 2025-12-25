"use client";

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
  const [items, setItems] = useState<ComboItem<TMeta>[]>(controlledItems || []);
  const [loading, setLoading] = useState(false);

  const timerRef = useRef<number | null>(null);
  const reqTokenRef = useRef(0);

  const activeId = useMemo(
    () => (active != null ? `${listId}-opt-${active}` : undefined),
    [active, listId],
  );

  const hasQuery = Boolean(q && q.trim());
  const canShowListbox = open && (hasQuery || loading);

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
    if (!canShowListbox || active == null) return;
    const el = document.getElementById(`${listId}-opt-${active}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [canShowListbox, active, listId]);

  // Keep active index sane when items change
  useEffect(() => {
    if (active == null) {
      if (items.length > 0) setActive(0);
      return;
    }
    if (items.length === 0) {
      setActive(null);
      return;
    }
    if (active >= items.length) setActive(items.length - 1);
  }, [items, active]);

  // Suggestions (debounced) when not controlled via `items`
  useEffect(() => {
    // Controlled mode: just mirror items; DO NOT close listbox when empty
    if (controlledItems) {
      setItems(controlledItems);
      setLoading(false);
      // keep active consistent but don't force open/close here
      setActive(controlledItems.length ? 0 : null);
      return;
    }

    if (!fetchSuggestionsAction) return;

    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!q?.trim()) {
      reqTokenRef.current += 1; // invalidate any in-flight responses
      setLoading(false);
      setItems([]);
      setOpen(false);
      setActive(null);
      return;
    }

    const localToken = ++reqTokenRef.current;
    setLoading(true);

    timerRef.current = window.setTimeout(async () => {
      try {
        const res = await fetchSuggestionsAction(q);
        if (localToken !== reqTokenRef.current) return;

        const next = Array.isArray(res) ? res : [];
        setItems(next);
        setActive(next.length ? 0 : null);
        setLoading(false);

        // Keep listbox visible while user is interacting and query is non-empty
        if (
          typeof document !== "undefined" &&
          document.activeElement === inputRef.current
        ) {
          setOpen(true);
        }
      } catch {
        if (localToken === reqTokenRef.current) {
          setItems([]);
          setActive(null);
          setLoading(false);

          // Keep listbox open so “No suggestions” can show
          if (
            typeof document !== "undefined" &&
            document.activeElement === inputRef.current
          ) {
            setOpen(true);
          }
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
      // Open even if empty (so “No suggestions” is reachable)
      if (q.trim()) setOpen(true);
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
          window.location.href = `/search?q=${encodeURIComponent(term)}`;
        }
        setOpen(false);
      }
      return;
    }

    if (!items.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i == null ? 0 : Math.min(items.length - 1, i + 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i == null ? items.length - 1 : Math.max(0, i - 1)));
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
          const next = e.target.value;
          const nextHasQuery = Boolean(next.trim());

          setQ(next);
          onChangeAction?.(next);

          // ✅ Open whenever the query is non-empty (even if items are empty).
          // This makes “No suggestions” reachable and avoids listbox flicker.
          setOpen(nextHasQuery);

          if (!nextHasQuery) {
            setActive(null);
          } else if (active == null && items.length > 0) {
            setActive(0);
          }
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          // Open when query is present, regardless of item count (or while loading)
          if (q.trim() || loading || items.length) setOpen(true);
        }}
        placeholder={placeholder}
        className={[
          "w-full rounded-xl border px-3 py-2 text-sm shadow-sm",
          "border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)]",
          "placeholder:text-[var(--text-muted)]",
          "focus-visible:outline-none focus-visible:ring-2 ring-focus",
        ].join(" ")}
        spellCheck
        autoCorrect="on"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={canShowListbox}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-activedescendant={activeId}
        aria-label={ariaLabel}
      />

      {canShowListbox && (
        <ul
          id={listId}
          role="listbox"
          aria-busy={loading ? "true" : "false"}
          className={[
            "absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border shadow-sm",
            "border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
          ].join(" ")}
        >
          {loading && (
            <li className="px-3 py-1.5 text-sm text-[var(--text-muted)] sm:py-2">
              Loading…
            </li>
          )}

          {!loading && items.length === 0 && (
            <li className="px-3 py-1.5 text-sm text-[var(--text-muted)] sm:py-2">
              No suggestions
            </li>
          )}

          {items.map((it, i) => (
            <li
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              key={it.id}
              className={[
                "cursor-pointer px-3 py-1.5 text-sm text-[var(--text)] sm:py-2",
                i === active ? "bg-[var(--bg-subtle)]" : "bg-transparent",
              ].join(" ")}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(it)}
            >
              {renderItemAction ? renderItemAction(it, i === active) : it.label}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-0.5 text-[11px] text-[var(--text-muted)] sm:mt-1 sm:text-xs">
        Use ↑/↓ to navigate, Enter to select or search, Esc to dismiss.
      </p>
    </div>
  );
}
