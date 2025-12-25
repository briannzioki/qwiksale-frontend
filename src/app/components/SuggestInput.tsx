"use client";
// src/app/components/SuggestInput.tsx

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import useSuggest, {
  type Suggestion,
  type SuggestionType,
} from "@/app/hooks/useSuggest";

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
  label?: string; // optional visible label
  ariaLabel?: string; // if no visible label
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
  } catch {
    // ignore
  }
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
  const inputId = useId();
  const listboxId = useId();
  const optionIdBase = useId();

  // Don’t pass extraParams if undefined (exactOptionalPropertyTypes)
  const hookArgs = extraParams
    ? { endpoint, debounceMs: 200, minLength, limit, extraParams }
    : { endpoint, debounceMs: 200, minLength, limit };

  const { setQuery, items, loading, error, cancel } = useSuggest(hookArgs);

  // Local input value; value prop is just the initial/external value
  const [innerValue, setInnerValue] = useState(value ?? "");

  // Keep local value + hook query in sync when parent changes value (e.g. SSR q)
  useEffect(() => {
    const next = value ?? "";
    setInnerValue(next);
    setQuery(next);
  }, [value, setQuery]);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number>(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmed = (innerValue ?? "").trim();
  const hasQuery = trimmed.length > 0;

  // Filter by types if requested
  const filtered = useMemo(() => {
    if (!typesAllowed?.length) return items;
    const set = new Set(typesAllowed);
    return items.filter((it) => set.has(it.type));
  }, [items, typesAllowed]);

  const hasResults = filtered.length > 0;
  const meetsMin = trimmed.length >= Math.max(0, minLength);

  // ✅ Listbox visibility should depend on “typed input / open”, not on results count.
  const showList = useMemo(() => {
    if (disabled) return false;
    if (!open) return false;
    if (!hasQuery) return false;
    return true;
  }, [disabled, open, hasQuery]);

  const handleChange = useCallback(
    async (next: string) => {
      setInnerValue(next);
      setQuery(next);
      setOpen(Boolean(next.trim()));
      setActive(-1);
      if (onChangeAction) {
        await onChangeAction(next);
      }
    },
    [onChangeAction, setQuery],
  );

  const closeList = useCallback(() => {
    setOpen(false);
    setActive(-1);
  }, []);

  const onSelect = useCallback(
    async (idx: number) => {
      const item = filtered[idx];
      if (!item) return;
      const next = item.value;
      setInnerValue(next);
      setQuery(next);
      emit("qs:suggest:pick", { item });
      try {
        if (onChangeAction) {
          await onChangeAction(next);
        }
        await onPickAction?.(item);
      } catch {
        // swallow errors from callbacks
      }
      closeList();
    },
    [filtered, onChangeAction, onPickAction, setQuery, closeList],
  );

  // Keyboard navigation
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showList) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          // ✅ allow opening even when there are no results yet
          if (hasQuery) setOpen(true);
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
    [active, filtered, onSelect, showList, closeList, hasQuery],
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

  useEffect(
    () => () => {
      cancel();
    },
    [cancel],
  );

  return (
    <div
      className={["relative", className].join(" ")}
      onBlur={onBlurContainer}
      onFocus={onFocusContainer}
    >
      {label ? (
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
      ) : null}

      <input
        id={inputId}
        ref={inputRef}
        name={name}
        type="text"
        value={innerValue}
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
          "w-full rounded-xl px-3 py-2 text-sm shadow-sm sm:px-4 sm:text-[0.95rem]",
          "bg-[var(--bg)] text-[var(--text)]",
          "border border-[var(--border-subtle)]",
          "placeholder:text-[var(--text-muted)]",
          "focus-visible:outline-none focus-visible:ring-2 ring-focus",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          inputClassName || "",
        ].join(" ")}
        onFocus={() => setOpen(Boolean((innerValue ?? "").trim()))}
      />

      {/* Dropdown */}
      {showList && (
        <div
          className={[
            "absolute z-20 mt-1 w-full rounded-xl border shadow-sm",
            "bg-[var(--bg-elevated)] border-[var(--border-subtle)]",
            listClassName || "",
          ].join(" ")}
        >
          <ul
            id={listboxId}
            role="listbox"
            className="max-h-72 overflow-auto py-1"
          >
            {!meetsMin && (
              <li className="px-2.5 py-2 text-sm text-[var(--text-muted)] sm:px-3">
                Type at least {Math.max(0, minLength)} characters
              </li>
            )}

            {meetsMin && loading && (
              <li className="px-2.5 py-2 text-sm text-[var(--text-muted)] sm:px-3">
                Loading…
              </li>
            )}

            {meetsMin && !loading && error && (
              <li className="px-2.5 py-2 text-sm text-[var(--danger)] sm:px-3">
                Error: {error}
              </li>
            )}

            {meetsMin && !loading && !error && !hasResults && (
              <li className="px-2.5 py-2 text-sm text-[var(--text-muted)] sm:px-3">
                No suggestions
              </li>
            )}

            {meetsMin &&
              !loading &&
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
                      "cursor-pointer select-none px-2.5 py-2 text-sm sm:px-3",
                      "text-[var(--text)]",
                      isActive
                        ? "bg-[var(--bg-subtle)]"
                        : "bg-transparent hover:bg-[var(--bg-subtle)]",
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
                          "ml-auto rounded-full px-2 py-[2px] text-[10px] sm:text-[11px]",
                          "border border-[var(--border-subtle)]",
                          "bg-[var(--bg-subtle)] text-[var(--text-muted)]",
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

      <p className="mt-1 text-[11px] text-[var(--text-muted)] sm:text-xs">
        Use ↑/↓ to navigate, Enter to pick, Esc to close.
      </p>
    </div>
  );
}
