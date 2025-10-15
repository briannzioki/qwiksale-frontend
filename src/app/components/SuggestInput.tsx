// src/app/components/SuggestInput.tsx
"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import useSuggest, { type Suggestion, type SuggestionType } from "@/app/hooks/useSuggest";

type Props = {
  endpoint: string;
  value: string;

  /** Ends with Action to be Server Action-safe from RSC parents */
  onChangeAction?: (next: string) => void | Promise<void>;
  onPickAction?: (item: Suggestion) => void | Promise<void>;

  placeholder?: string;
  className?: string;
  inputClassName?: string;
  listClassName?: string;
  disabled?: boolean;
  name?: string;
  label?: string;          // optional visible label
  ariaLabel?: string;      // if no visible label
  autoFocus?: boolean;

  /** Minimum characters before fetching (default 2). */
  minLength?: number;
  /** How many suggestions to request (default 10). */
  limit?: number;
  /** If provided, only show suggestions with these types. */
  typesAllowed?: SuggestionType[];

  /** Extra params to append to the endpoint, e.g. { kind: "services" } */
  extraParams?: Record<string, string | number | boolean | undefined>;
};

function emit(name: string, detail?: unknown) {
  try {
    // eslint-disable-next-line no-console
    console.log(`[qs:event] ${name}`, detail);
    if (typeof window !== "undefined" && "CustomEvent" in window) {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  } catch {}
}

export default function SuggestInput({
  endpoint,
  value,
  onChangeAction,
  onPickAction,
  placeholder = "Search…",
  className = "",
  inputClassName = "",
  listClassName = "",
  disabled = false,
  name,
  label,
  ariaLabel,
  autoFocus = false,
  minLength = 2,
  limit = 10,
  typesAllowed,
  extraParams,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();
  const optionIdBase = useId();

  // Don’t pass extraParams if undefined (exactOptionalPropertyTypes)
  const hookArgs =
    extraParams
      ? { endpoint, debounceMs: 200, minLength, limit, extraParams }
      : { endpoint, debounceMs: 200, minLength, limit };

  const { query, setQuery, items, loading, error, clear, cancel } = useSuggest(hookArgs);

  // Keep hook's query in sync with external value (when parent controls value)
  useEffect(() => {
    if ((value ?? "") !== (query ?? "")) setQuery(value ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number>(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter by types if requested
  const filtered = useMemo(() => {
    if (!typesAllowed?.length) return items;
    const set = new Set(typesAllowed);
    return items.filter((it) => set.has(it.type));
  }, [items, typesAllowed]);

  const hasResults = filtered.length > 0;

  const showList = useMemo(() => {
    if (disabled) return false;
    if (!open) return false;
    if ((value?.trim().length ?? 0) < Math.max(0, minLength)) return false;
    return true;
  }, [disabled, open, value, minLength]);

  const handleChange = useCallback(
    async (next: string) => {
      await onChangeAction?.(next);
      setQuery(next);
      setOpen(true);
      setActive(-1);
    },
    [onChangeAction, setQuery]
  );

  const closeList = useCallback(() => {
    setOpen(false);
    setActive(-1);
  }, []);

  const onSelect = useCallback(
    async (idx: number) => {
      const item = filtered[idx];
      if (!item) return;
      await onChangeAction?.(item.value);
      setQuery(item.value);
      emit("qs:suggest:pick", { item });
      try {
        await onPickAction?.(item);
      } catch {}
      closeList();
    },
    [filtered, onChangeAction, onPickAction, setQuery, closeList]
  );

  // Keyboard navigation
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showList) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          // if we have something to show, opening with arrows feels natural
          if (hasResults) setOpen(true);
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % Math.max(1, filtered.length));
        setOpen(true);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i <= 0 ? filtered.length - 1 : i - 1));
        setOpen(true);
      } else if (e.key === "Enter") {
        if (active >= 0 && active < filtered.length) {
          e.preventDefault();
          void onSelect(active);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeList();
      }
    },
    [active, filtered, onSelect, showList, closeList, hasResults]
  );

  // Blur handling (delay to allow click on options)
  const onBlurContainer = useCallback(() => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => {
      closeList();
    }, 120);
  }, [closeList]);

  const onFocusContainer = useCallback(() => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return (
    <div
      className={["relative", className].join(" ")}
      onBlur={onBlurContainer}
      onFocus={onFocusContainer}
    >
      {label ? (
        <label className="sr-only">{label}</label>
      ) : null}
      <input
        ref={inputRef}
        name={name}
        type="text"
        value={value}
        onChange={(e) => void handleChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        autoCorrect="on"
        spellCheck
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${optionIdBase}-${active}` : undefined}
        aria-label={!label ? ariaLabel : undefined}
        className={[
          "w-full px-4 py-2 rounded-lg",
          "text-gray-900 dark:text-slate-100",
          "placeholder:text-gray-500 dark:placeholder:text-slate-400",
          // ↓ lighter, calmer surfaces per audit
          "bg-white dark:bg-slate-900",
          "border border-gray-200 dark:border-white/10",
          "focus:outline-none focus:ring-2 focus:ring-brandBlue",
          "disabled:opacity-60",
          inputClassName || "",
        ].join(" ")}
        onFocus={() => setOpen(true)}
      />

      {/* Dropdown */}
      {showList && (
        <div
          className={[
            "absolute z-20 mt-1 w-full rounded-xl shadow-lg",
            // ↓ toned glass / lighter borders
            "bg-white dark:bg-slate-900",
            "border border-gray-200 dark:border-white/10",
            listClassName || "",
          ].join(" ")}
        >
          <ul id={listboxId} role="listbox" className="max-h-72 overflow-auto py-1">
            {loading && (
              <li className="px-3 py-2 text-sm text-gray-500 dark:text-slate-400">Loading…</li>
            )}
            {!loading && error && (
              <li className="px-3 py-2 text-sm text-rose-600 dark:text-rose-400">Error: {error}</li>
            )}
            {!loading && !error && !hasResults && (
              <li className="px-3 py-2 text-sm text-gray-500 dark:text-slate-400">No suggestions</li>
            )}
            {!loading &&
              !error &&
              filtered.map((sug, i) => {
                const isActive = i === active;
                return (
                  <li
                    id={`${optionIdBase}-${i}`}
                    key={`${sug.type}:${sug.label}:${i}`}
                    role="option"
                    aria-selected={isActive}
                    className={[
                      "px-3 py-2 text-sm cursor-pointer select-none",
                      "text-gray-900 dark:text-slate-100",
                      isActive
                        ? "bg-gray-100 dark:bg-white/5"
                        : "hover:bg-gray-50 dark:hover:bg-white/5",
                    ].join(" ")}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => {
                      // prevent input blur before click handler
                      e.preventDefault();
                    }}
                    onClick={() => void onSelect(i)}
                    title={sug.label}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate">{sug.label}</span>
                      <span
                        className={[
                          "ml-auto text-[11px] px-2 py-[2px] rounded-full",
                          // outline pill that matches new chip tone
                          "border border-gray-200 dark:border-white/10",
                          "text-gray-600 dark:text-slate-300",
                        ].join(" ")}
                      >
                        {sug.type}
                      </span>
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
}
