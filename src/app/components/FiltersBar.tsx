// src/app/components/FiltersBar.tsx
"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import SuggestInput from "@/app/components/SuggestInput";

export type Filters = {
  query: string;
  condition: "all" | "brand new" | "pre-owned";
  minPrice?: number | "";
  maxPrice?: number | "";
  // ⬇️ match API sort keys
  sort: "newest" | "price_asc" | "price_desc" | "featured";
  // ⬇️ keeps the old name, but this maps to API `featured=true`
  verifiedOnly?: boolean;
};

type Props = {
  /** Initial filters value (controlled-from-server); component manages local changes */
  value: Filters;

  /**
   * Optional callback (can be a Server Action) notified whenever filters change.
   * Renamed to end with "Action" to satisfy Next.js serialization rules.
   */
  onFiltersChangeAction?: (f: Filters) => void | Promise<void>;

  /**
   * Optional callback (can be a Server Action) for an explicit submit (Search button or Enter key).
   */
  onSubmitAction?: (f: Filters) => void | Promise<void>;

  /** If provided, enables suggestions and points to an API endpoint (e.g. "/api/services/suggest"). */
  suggestEndpoint?: string;

  showVerifiedToggle?: boolean;
  disabled?: boolean;
  className?: string;
  /** Debounce for typing into the search box */
  debounceMs?: number;
};

/* ---------- lightweight client analytics / events ---------- */

function emit<T = unknown>(name: string, detail?: T) {
  // eslint-disable-next-line no-console
  console.log(`[qs:event] ${name}`, detail);
  if (typeof window !== "undefined" && "CustomEvent" in window) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

export default function FiltersBar({
  value,
  onFiltersChangeAction,
  onSubmitAction,
  suggestEndpoint,             // ← NEW
  showVerifiedToggle = false,
  disabled = false,
  className = "",
  debounceMs = 300,
}: Props) {
  const { condition, minPrice, maxPrice, sort } = value;

  // Local state for query (debounced)
  const [qLocal, setQLocal] = useState<string>(value.query ?? "");
  const debTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDebounce = useCallback(() => {
    if (debTimer.current) {
      clearTimeout(debTimer.current);
      debTimer.current = null;
    }
  }, []);

  // Focus management: "/" focuses the search box (use element id to support SuggestInput)
  const idSearch = useId();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (e.key === "/" && targetTag !== "INPUT" && targetTag !== "TEXTAREA") {
        e.preventDefault();
        document.getElementById(idSearch)?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idSearch]);

  // Keep local q in sync if the parent re-renders with a different value.query
  useEffect(() => {
    if (value.query !== qLocal) setQLocal(value.query ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.query]);

  // Debounced search typing → notify parent (if provided) + emit client event
  useEffect(() => {
    if (disabled) {
      clearDebounce();
      return;
    }

    clearDebounce();
    const t = setTimeout(async () => {
      if (qLocal !== (value.query ?? "")) {
        const next = { ...value, query: qLocal };
        emit("qs:filters:change", { source: "debounce", filters: next, debounceMs });
        try {
          await onFiltersChangeAction?.(next);
        } catch (e) {
          console.error("[FiltersBar] onFiltersChangeAction debounced error:", e);
        }
      }
    }, Math.max(0, debounceMs));
    debTimer.current = t;

    return () => {
      clearTimeout(t);
      if (debTimer.current === t) debTimer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal, debounceMs, disabled]);

  // Helper to compute next filters and notify
  const notifyChange = useCallback(
    async (next: Filters, meta?: Record<string, unknown>) => {
      emit("qs:filters:change", { source: "immediate", filters: next, ...meta });
      try {
        await onFiltersChangeAction?.(next);
      } catch (e) {
        console.error("[FiltersBar] onFiltersChangeAction error:", e);
      }
    },
    [onFiltersChangeAction]
  );

  const update = useCallback(
    (patch: Partial<Filters>, trackLabel?: keyof Filters | string) => {
      if (disabled) return;
      clearDebounce(); // avoid a double-call after immediate update
      const next = { ...value, ...patch };
      void notifyChange(next, trackLabel ? { field: trackLabel } : undefined);
    },
    [disabled, notifyChange, value, clearDebounce]
  );

  const applyNow = useCallback(async () => {
    if (disabled) return;
    clearDebounce(); // ensure immediate submit isn't followed by a stale debounced call
    const next = qLocal !== (value.query ?? "") ? { ...value, query: qLocal } : value;
    emit("qs:filters:submit", { filters: next });
    try {
      await onSubmitAction?.(next);
    } catch (e) {
      console.error("[FiltersBar] onSubmitAction error:", e);
    }
  }, [disabled, onSubmitAction, qLocal, value, clearDebounce]);

  const reset = useCallback(async () => {
    if (disabled) return;
    clearDebounce();
    const base: Filters = {
      query: "",
      condition: "all",
      minPrice: "",
      maxPrice: "",
      sort: "newest",
      ...(typeof value.verifiedOnly === "boolean" ? { verifiedOnly: false } : {}),
    };
    setQLocal("");
    emit("qs:filters:reset", { filters: base });
    try {
      await onFiltersChangeAction?.(base);
      await onSubmitAction?.(base);
    } catch (e) {
      console.error("[FiltersBar] reset actions error:", e);
    }
  }, [disabled, onFiltersChangeAction, onSubmitAction, value.verifiedOnly, clearDebounce]);

  const hasBoth = typeof minPrice === "number" && typeof maxPrice === "number";
  const rangeInvalid = hasBoth && (minPrice as number) > (maxPrice as number);

  const idCond = useId();
  const idSort = useId();
  const idMin = useId();
  const idMax = useId();
  const idVerified = useId();
  const idRangeHint = useId();

  const placeholder = useMemo(() => "Search by name, brand, category…", []);

  // Keyboard affordances with the plain input (SuggestInput handles its own keys)
  const onSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") void applyNow();
      if (e.key === "Escape") {
        setQLocal("");
        update({ query: "" }, "query");
      }
    },
    [applyNow, update]
  );

  // Clamp helper for price fields (accepts commas and trims junk)
  const parsePrice = useCallback((v: string): number | "" => {
    const raw = (v ?? "").toString().replace(/,/g, "").replace(/[^\d]/g, "");
    if (raw === "") return "";
    const n = Math.max(0, Number(raw));
    return Number.isFinite(n) ? n : "";
  }, []);

  return (
    <div
      className={`card-surface w-full px-4 py-3 ${className}`}
      role="region"
      aria-label="Listing filters"
      aria-live="polite"
    >
      <div className="flex flex-col lg:flex-row gap-3 lg:items-end lg:justify-between">
        {/* Search */}
        <div className="flex-1 flex gap-2">
          <label htmlFor={idSearch} className="sr-only">
            Search
          </label>

          {/* If suggestEndpoint is provided, render SuggestInput; otherwise fallback to a plain input */}
          {suggestEndpoint ? (
            <div className="w-full">
              <SuggestInput
                // Use the deterministic id so the "/" shortcut can focus it
                name={idSearch}
                // aria-label provided since the visible label is sr-only
                ariaLabel="Search"
                endpoint={suggestEndpoint}
                value={qLocal}
                onChangeAction={async (next) => {
                  setQLocal(next);
                  // do NOT notify parent here; keep debounce/applyNow behavior
                }}
                // Explicit submit still goes through the Search button / Enter in plain input context
                placeholder={placeholder}
                disabled={disabled}
                // Match styling to the old input
                inputClassName="
                  w-full px-4 py-2 rounded-lg
                  text-gray-900 dark:text-slate-100
                  placeholder:text-gray-500 dark:placeholder:text-slate-400
                  bg-white dark:bg-slate-800
                  border border-gray-300 dark:border-slate-700
                  focus:outline-none focus:ring-2 focus:ring-[#39a0ca]
                  disabled:opacity-60
                "
              />
            </div>
          ) : (
            <input
              id={idSearch}
              type="text"
              value={qLocal}
              onChange={(e) => setQLocal(e.target.value)}
              onKeyDown={onSearchKeyDown}
              inputMode="search"
              enterKeyHint="search"
              placeholder={placeholder}
              disabled={disabled}
              autoCorrect="on"
              spellCheck
              className="
                w-full px-4 py-2 rounded-lg
                text-gray-900 dark:text-slate-100
                placeholder:text-gray-500 dark:placeholder:text-slate-400
                bg-white dark:bg-slate-800
                border border-gray-300 dark:border-slate-700
                focus:outline-none focus:ring-2 focus:ring-[#39a0ca]
                disabled:opacity-60
              "
            />
          )}

          <button
            onClick={() => void applyNow()}
            disabled={disabled}
            className="
              px-3 md:px-4 py-2 rounded-lg
              bg-white dark:bg-slate-800
              text-gray-900 dark:text-slate-100
              border border-gray-300 dark:border-slate-700
              hover:bg-gray-50 dark:hover:bg-slate-700
              disabled:opacity-60
            "
            title="Search"
          >
            Search
          </button>
          <button
            onClick={() => {
              setQLocal("");
              update({ query: "" }, "query");
            }}
            disabled={disabled || !qLocal}
            className="
              px-3 md:px-4 py-2 rounded-lg
              bg-white dark:bg-slate-800
              text-gray-900 dark:text-slate-100
              border border-gray-300 dark:border-slate-700
              hover:bg-gray-50 dark:hover:bg-slate-700
              disabled:opacity-60
            "
            title="Clear search"
          >
            Clear
          </button>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 w-full lg:w-auto">
          <div>
            <label htmlFor={idCond} className="sr-only">
              Condition
            </label>
            <select
              id={idCond}
              value={condition}
              onChange={(e) =>
                update({ condition: e.target.value as Filters["condition"] }, "condition")
              }
              className="
                w-full rounded-lg px-3 py-2
                text-gray-900 dark:text-slate-100
                bg-white dark:bg-slate-800
                border border-gray-300 dark:border-slate-700
              "
              title="Condition"
              disabled={disabled}
            >
              <option value="all">All Conditions</option>
              <option value="brand new">Brand New</option>
              <option value="pre-owned">Pre-Owned</option>
            </select>
          </div>

          <div>
            <label htmlFor={idSort} className="sr-only">
              Sort
            </label>
            <select
              id={idSort}
              value={sort}
              onChange={(e) => update({ sort: e.target.value as Filters["sort"] }, "sort")}
              className="
                w-full rounded-lg px-3 py-2
                text-gray-900 dark:text-slate-100
                bg-white dark:bg-slate-800
                border border-gray-300 dark:border-slate-700
              "
              title="Sort"
              disabled={disabled}
            >
              <option value="newest">Newest</option>
              <option value="featured">Featured first</option>
              <option value="price_asc">Price: Low → High</option>
              <option value="price_desc">Price: High → Low</option>
            </select>
          </div>

          <div>
            <label htmlFor={idMin} className="sr-only">
              Min price
            </label>
            <input
              id={idMin}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={minPrice === "" ? "" : Number(minPrice)}
              onChange={(e) => update({ minPrice: parsePrice(e.target.value) }, "minPrice")}
              onBlur={(e) => update({ minPrice: parsePrice(e.target.value) }, "minPrice")}
              onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
              placeholder="Min KES"
              className={`
                w-full rounded-lg px-3 py-2
                text-gray-900 dark:text-slate-100
                bg-white dark:bg-slate-800
                border border-gray-300 dark:border-slate-700
                ${rangeInvalid ? "border-red-400 focus:ring-red-300" : ""}
              `}
              title="Min price"
              aria-invalid={rangeInvalid}
              aria-describedby={rangeInvalid ? idRangeHint : undefined}
              disabled={disabled}
            />
          </div>

          <div>
            <label htmlFor={idMax} className="sr-only">
              Max price
            </label>
            <input
              id={idMax}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={maxPrice === "" ? "" : Number(maxPrice)}
              onChange={(e) => update({ maxPrice: parsePrice(e.target.value) }, "maxPrice")}
              onBlur={(e) => update({ maxPrice: parsePrice(e.target.value) }, "maxPrice")}
              onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
              placeholder="Max KES"
              className={`
                w-full rounded-lg px-3 py-2
                text-gray-900 dark:text-slate-100
                bg-white dark:bg-slate-800
                border border-gray-300 dark:border-slate-700
                ${rangeInvalid ? "border-red-400 focus:ring-red-300" : ""}
              `}
              title="Max price"
              aria-invalid={rangeInvalid}
              aria-describedby={rangeInvalid ? idRangeHint : undefined}
              disabled={disabled}
            />
          </div>

          {showVerifiedToggle && (
            <label
              htmlFor={idVerified}
              className="
                inline-flex items-center gap-2 rounded-lg
                bg-white dark:bg-slate-800
                text-gray-900 dark:text-slate-100
                border border-gray-300 dark:border-slate-700
                px-3 py-2 text-sm select-none
              "
              title="Featured (verified) listings only"
            >
              <input
                id={idVerified}
                type="checkbox"
                checked={!!value.verifiedOnly}
                onChange={(e) => update({ verifiedOnly: e.target.checked }, "verifiedOnly")}
                className="rounded border-gray-300 dark:border-slate-600"
                disabled={disabled}
              />
              Featured only
            </label>
          )}
        </div>
      </div>

      {rangeInvalid && (
        <p id={idRangeHint} className="mt-2 text-xs text-red-600">
          Min price is greater than max price. Adjust the range to apply a valid filter.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => void reset()}
          disabled={disabled}
          className="
            rounded-lg border px-3 py-1.5 text-sm
            bg-white dark:bg-slate-800
            text-gray-900 dark:text-slate-100
            border-gray-300 dark:border-slate-700
            hover:bg-gray-50 dark:hover:bg-slate-700
            disabled:opacity-60
          "
          title="Reset all filters"
        >
          Reset all
        </button>
      </div>
    </div>
  );
}
