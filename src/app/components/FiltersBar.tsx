"use client";
// src/app/components/FiltersBar.tsx

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import SuggestInput from "@/app/components/SuggestInput";
import IconButton from "@/app/components/IconButton";
import NumberInputNoWheel from "@/app/components/ui/NumberInputNoWheel";

export type Filters = {
  /** Search keywords */
  query: string;

  /** Top-level taxonomy */
  category?: string;
  subcategory?: string;

  /** “More filters” */
  brand?: string;
  condition: "all" | "brand new" | "pre-owned";
  minPrice?: number | "";
  maxPrice?: number | "";

  /** Always visible */
  sort: "newest" | "price_asc" | "price_desc" | "featured";
  verifiedOnly?: boolean; // maps to `featured` query param name
};

type Props = {
  value: Filters;
  onFiltersChangeAction?: (f: Filters) => void | Promise<void>;
  onSubmitAction?: (f: Filters) => void | Promise<void>;
  suggestEndpoint?: string;
  showVerifiedToggle?: boolean;
  disabled?: boolean;
  className?: string;
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
  suggestEndpoint,
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

  // Focus management: "/" focuses the search box (works for input or SuggestInput[name=...])
  const idSearch = useId();
  useEffect(() => {
    function focusSearch() {
      const byId = document.getElementById(idSearch) as HTMLElement | null;
      if (byId) {
        byId.focus();
        return;
      }
      const byName = document.querySelector<HTMLElement>(`[name="q"]`);
      byName?.focus();
    }
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        focusSearch();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idSearch]);

  // Keep local q in sync if parent changes value.query
  useEffect(() => {
    if (value.query !== qLocal) setQLocal(value.query ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.query]);

  // Debounced search typing → notify parent
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
      category: "",
      subcategory: "",
      brand: "",
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
  const idCategory = useId();
  const idSubcategory = useId();
  const idBrand = useId();
  const idDetails = useId(); // controls the <details> “More filters”

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

  // safe values for selects (avoid uncontrolled component warnings)
  const conditionValue = (condition ?? "all") as Filters["condition"];
  const sortValue = (sort ?? "newest") as Filters["sort"];

  const inputBase =
    "w-full rounded-lg px-3 py-2 " +
    "text-gray-900 dark:text-slate-100 " +
    "bg-white dark:bg-slate-800 " +
    "border border-gray-200 dark:border-white/10 " + // toned-down borders
    "placeholder:text-gray-500 dark:placeholder:text-slate-400 " +
    "focus:outline-none focus:ring-2 focus:ring-[#39a0ca] disabled:opacity-60";

  const selectBase =
    "w-full rounded-lg px-3 py-2 " +
    "text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-800 " +
    "border border-gray-200 dark:border-white/10";

  const buttonBase =
    "px-3 md:px-4 py-2 rounded-lg " +
    "bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 " +
    "border border-gray-200 dark:border-white/10 " +
    "hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-60";

  // ----- Mobile Refine & Sort via IconButtons -----
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const sortRef = useRef<HTMLSelectElement | null>(null);
  const [refineOpen, setRefineOpen] = useState(false);

  useEffect(() => {
    const el = detailsRef.current;
    if (!el) return;
    const onToggle = () => setRefineOpen(el.open);
    el.addEventListener("toggle", onToggle);
    return () => el.removeEventListener("toggle", onToggle);
  }, []);

  const toggleRefine = useCallback(() => {
    const el = detailsRef.current;
    if (!el) return;
    el.open = !el.open;
    if (el.open) {
      // focus first interactive control for a11y
      const first = el.querySelector<HTMLElement>("input, select, button");
      first?.focus();
    }
  }, []);

  const focusSort = useCallback(() => {
    sortRef.current?.focus();
    // Optionally nudge a small highlight
    sortRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  return (
    <div
      className={`card-surface w-full px-4 py-3 ${className}`}
      role="region"
      aria-label="Listing filters"
      aria-live="polite"
      data-filter-bar="true"
    >
      {/* Mobile quick actions */}
      <div className="mb-2 flex items-center gap-2 md:hidden">
        <IconButton
          icon="refine"
          labelText="Refine"
          variant="outline"
          onClick={toggleRefine}
          aria-controls={idDetails}
          aria-expanded={refineOpen}
        />
        <IconButton
          icon="sort"
          labelText="Sort"
          variant="outline"
          onClick={focusSort}
          aria-controls={idSort}
        />
      </div>

      {/* Row 1: Search / Category / Subcategory + Sort + (optional) Featured */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-12 md:items-end">
        {/* Search */}
        <div className="md:col-span-4 flex gap-2">
          {/* Label: only attach htmlFor when we control an input id */}
          <label
            className="sr-only"
            {...(!suggestEndpoint ? { htmlFor: idSearch } : {})}
          >
            Keywords
          </label>

          {/* If suggestEndpoint is provided, render SuggestInput; otherwise fallback to a plain input */}
          {suggestEndpoint ? (
            <div className="w-full">
              <SuggestInput
                name="q"                         // ← expected name
                ariaLabel="Keywords"
                endpoint={suggestEndpoint}
                value={qLocal}
                onChangeAction={async (next) => {
                  setQLocal(next);
                }}
                placeholder="Search by name, brand, category…"
                disabled={disabled}
                inputClassName={inputBase}
              />
            </div>
          ) : (
            <input
              id={idSearch}
              name="q"                          // ← expected name
              type="text"
              value={qLocal}
              onChange={(e) => setQLocal(e.target.value)}
              onKeyDown={onSearchKeyDown}
              inputMode="search"
              enterKeyHint="search"
              placeholder="Search by name, brand, category…"
              disabled={disabled}
              autoCorrect="on"
              spellCheck
              className={inputBase}
            />
          )}

          <button
            type="button"
            onClick={() => void applyNow()}
            disabled={disabled}
            className={buttonBase}
            title="Search"
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => {
              setQLocal("");
              update({ query: "" }, "query");
            }}
            disabled={disabled || !qLocal}
            className={buttonBase}
            title="Clear search"
          >
            Clear
          </button>
        </div>

        {/* Category */}
        <div className="md:col-span-3">
          <label htmlFor={idCategory} className="sr-only">
            Category
          </label>
          <input
            id={idCategory}
            name="category"                   // ← expected name
            type="text"
            value={value.category ?? ""}
            onChange={(e) => update({ category: e.target.value }, "category")}
            placeholder="Category"
            disabled={disabled}
            className={inputBase}
          />
        </div>

        {/* Subcategory */}
        <div className="md:col-span-3">
          <label htmlFor={idSubcategory} className="sr-only">
            Subcategory
          </label>
          <input
            id={idSubcategory}
            name="subcategory"               // ← expected name
            type="text"
            value={value.subcategory ?? ""}
            onChange={(e) => update({ subcategory: e.target.value }, "subcategory")}
            placeholder="Subcategory"
            disabled={disabled}
            className={inputBase}
          />
        </div>

        {/* Sort */}
        <div className="md:col-span-2">
          <label htmlFor={idSort} className="sr-only">
            Sort
          </label>
          <select
            id={idSort}
            name="sort"                       // ← expected name
            ref={sortRef}
            value={sortValue}
            onChange={(e) => update({ sort: e.target.value as Filters["sort"] }, "sort")}
            className={selectBase}
            title="Sort"
            disabled={disabled}
          >
            <option value="newest">Newest</option>
            <option value="featured">Featured first</option>
            <option value="price_asc">Price: Low → High</option>
            <option value="price_desc">Price: High → Low</option>
          </select>
        </div>

        {/* Featured toggle (optional, maps to `featured` query param) */}
        {showVerifiedToggle && (
          <div className="md:col-span-2 md:col-start-11 md:row-start-1 md:justify-self-end hidden md:block">
            <label
              htmlFor={idVerified}
              className="
                inline-flex items-center gap-2 rounded-lg
                bg-white dark:bg-slate-800
                text-gray-900 dark:text-slate-100
                border border-gray-200 dark:border-white/10
                px-3 py-2 text-sm select-none w-full justify-center
              "
              title="Featured (verified) listings only"
            >
              <input
                id={idVerified}
                name="featured"               // ← expected name
                type="checkbox"
                checked={!!value.verifiedOnly}
                onChange={(e) => update({ verifiedOnly: e.target.checked }, "verifiedOnly")}
                className="rounded border-gray-300 dark:border-slate-600"
                disabled={disabled}
              />
              Featured only
            </label>
          </div>
        )}
      </div>

      {/* Row 2: More filters (Brand / Condition / Min / Max) */}
      <div className="mt-2">
        <details
          ref={detailsRef}
          id={idDetails}
          className="group rounded-xl border border-gray-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.03]"
        >
          <summary className="cursor-pointer list-none px-3 py-2 text-sm text-gray-700 dark:text-slate-200 flex items-center justify-between">
            <span className="inline-flex items-center gap-2">
              More filters
              <span className="text-gray-500 dark:text-slate-400 hidden md:inline">
                (brand, condition, price range)
              </span>
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              className="transition-transform duration-200 group-open:rotate-180 text-gray-500 dark:text-slate-400"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 15.5l-7-7 1.4-1.4L12 12.7l5.6-5.6L19 8.5z" />
            </svg>
          </summary>

          <div className="px-3 pb-3 pt-1 grid grid-cols-1 gap-2 md:grid-cols-12">
            {/* Brand */}
            <div className="md:col-span-3">
              <label htmlFor={idBrand} className="sr-only">
                Brand
              </label>
              <input
                id={idBrand}
                name="brand"                   // ← expected name
                type="text"
                value={value.brand ?? ""}
                onChange={(e) => update({ brand: e.target.value }, "brand")}
                placeholder="Brand (e.g., Samsung)"
                disabled={disabled}
                className={inputBase}
              />
            </div>

            {/* Condition */}
            <div className="md:col-span-3">
              <label htmlFor={idCond} className="sr-only">
                Condition
              </label>
              <select
                id={idCond}
                name="condition"               // ← expected name
                value={conditionValue}
                onChange={(e) =>
                  update({ condition: e.target.value as Filters["condition"] }, "condition")
                }
                className={selectBase}
                title="Condition"
                disabled={disabled}
              >
                <option value="all">All conditions</option>
                <option value="brand new">Brand New</option>
                <option value="pre-owned">Pre-Owned</option>
              </select>
            </div>

            {/* Price min */}
            <div className="md:col-span-3">
              <label htmlFor={idMin} className="sr-only">
                Min price
              </label>
              <NumberInputNoWheel
                id={idMin}
                name="minPrice"                // ← expected name
                min={0}
                step={1}
                inputMode="numeric"
                value={minPrice === "" || minPrice == null ? "" : Number(minPrice)}
                onChange={(e) => update({ minPrice: parsePrice(e.currentTarget.value) }, "minPrice")}
                onBlur={(e) => update({ minPrice: parsePrice(e.currentTarget.value) }, "minPrice")}
                placeholder="Min KES"
                className={`${inputBase} ${rangeInvalid ? "border-red-400 focus:ring-red-300" : ""}`}
                title="Min price"
                aria-invalid={rangeInvalid}
                aria-describedby={rangeInvalid ? idRangeHint : undefined}
                disabled={disabled}
              />
            </div>

            {/* Price max */}
            <div className="md:col-span-3">
              <label htmlFor={idMax} className="sr-only">
                Max price
              </label>
              <NumberInputNoWheel
                id={idMax}
                name="maxPrice"                // ← expected name
                min={0}
                step={1}
                inputMode="numeric"
                value={maxPrice === "" || maxPrice == null ? "" : Number(maxPrice)}
                onChange={(e) => update({ maxPrice: parsePrice(e.currentTarget.value) }, "maxPrice")}
                onBlur={(e) => update({ maxPrice: parsePrice(e.currentTarget.value) }, "maxPrice")}
                placeholder="Max KES"
                className={`${inputBase} ${rangeInvalid ? "border-red-400 focus:ring-red-300" : ""}`}
                title="Max price"
                aria-invalid={rangeInvalid}
                aria-describedby={rangeInvalid ? idRangeHint : undefined}
                disabled={disabled}
              />
            </div>

            {rangeInvalid && (
              <p id={idRangeHint} className="md:col-span-12 text-xs text-red-600">
                Min price is greater than max price. Adjust the range to apply a valid filter.
              </p>
            )}
          </div>
        </details>
      </div>

      {/* Footer actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void applyNow()} disabled={disabled} className={buttonBase} title="Apply">
          Apply filters
        </button>
        <button type="button" onClick={() => void reset()} disabled={disabled} className={buttonBase} title="Reset all">
          Reset all
        </button>
      </div>
    </div>
  );
}
