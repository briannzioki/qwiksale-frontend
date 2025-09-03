// src/app/components/FiltersBar.tsx
"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

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
  value: Filters;
  onChange: (f: Filters) => void;
  showVerifiedToggle?: boolean;
  disabled?: boolean;
  className?: string;
  onSubmit?: (f: Filters) => void;
  debounceMs?: number;
};

export default function FiltersBar({
  value,
  onChange,
  showVerifiedToggle = false,
  disabled = false,
  className = "",
  onSubmit,
  debounceMs = 300,
}: Props) {
  const { condition, minPrice, maxPrice, sort } = value;

  const [qLocal, setQLocal] = useState<string>(value.query ?? "");
  const debTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value.query !== qLocal) setQLocal(value.query ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.query]);

  useEffect(() => {
    if (disabled) {
      if (debTimer.current) {
        clearTimeout(debTimer.current);
        debTimer.current = null;
      }
      return;
    }

    if (debTimer.current) clearTimeout(debTimer.current);
    const t = setTimeout(() => {
      if (qLocal !== (value.query ?? "")) onChange({ ...value, query: qLocal });
    }, Math.max(0, debounceMs));
    debTimer.current = t;

    return () => {
      clearTimeout(t);
      if (debTimer.current === t) debTimer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal, debounceMs, disabled]);

  const update = useCallback(
    (patch: Partial<Filters>) => {
      if (!disabled) onChange({ ...value, ...patch });
    },
    [disabled, onChange, value]
  );

  const applyNow = useCallback(() => {
    if (disabled) return;
    const next = qLocal !== (value.query ?? "") ? { ...value, query: qLocal } : value;
    onChange(next);
    onSubmit?.(next);
  }, [disabled, onChange, onSubmit, qLocal, value]);

  const reset = useCallback(() => {
    if (disabled) return;
    const base: Filters = {
      query: "",
      condition: "all",
      minPrice: "",
      maxPrice: "",
      sort: "newest",
      ...(typeof value.verifiedOnly === "boolean" ? { verifiedOnly: false } : {}),
    };
    setQLocal("");
    onChange(base);
    onSubmit?.(base);
  }, [disabled, onChange, onSubmit, value.verifiedOnly]);

  const hasBoth = typeof minPrice === "number" && typeof maxPrice === "number";
  const rangeInvalid = hasBoth && (minPrice as number) > (maxPrice as number);

  const idSearch = useId();
  const idCond = useId();
  const idSort = useId();
  const idMin = useId();
  const idMax = useId();
  const idVerified = useId();

  const placeholder = useMemo(() => "Search by name, brand, category…", []);

  return (
    <div className={`card-surface w-full px-4 py-3 ${className}`} role="region" aria-label="Listing filters">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-end lg:justify-between">
        {/* Search */}
        <div className="flex-1 flex gap-2">
          <label htmlFor={idSearch} className="sr-only">Search</label>
          <input
            id={idSearch}
            type="text"
            value={qLocal}
            onChange={(e) => setQLocal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyNow()}
            placeholder={placeholder}
            disabled={disabled}
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
          <button
            onClick={applyNow}
            disabled={disabled}
            className="
              px-4 py-2 rounded-lg
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
            onClick={() => { setQLocal(""); update({ query: "" }); }}
            disabled={disabled || !qLocal}
            className="
              px-4 py-2 rounded-lg
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
            <label htmlFor={idCond} className="sr-only">Condition</label>
            <select
              id={idCond}
              value={condition}
              onChange={(e) => update({ condition: e.target.value as Filters["condition"] })}
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
            <label htmlFor={idSort} className="sr-only">Sort</label>
            <select
              id={idSort}
              value={sort}
              onChange={(e) => update({ sort: e.target.value as Filters["sort"] })}
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
            <label htmlFor={idMin} className="sr-only">Min price</label>
            <input
              id={idMin}
              type="number"
              min={0}
              inputMode="numeric"
              value={minPrice === "" ? "" : Number(minPrice)}
              onChange={(e) => update({ minPrice: e.target.value === "" ? "" : Math.max(0, Number(e.target.value)) })}
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
              disabled={disabled}
            />
          </div>

          <div>
            <label htmlFor={idMax} className="sr-only">Max price</label>
            <input
              id={idMax}
              type="number"
              min={0}
              inputMode="numeric"
              value={maxPrice === "" ? "" : Number(maxPrice)}
              onChange={(e) => update({ maxPrice: e.target.value === "" ? "" : Math.max(0, Number(e.target.value)) })}
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
                onChange={(e) => update({ verifiedOnly: e.target.checked })}
                className="rounded border-gray-300 dark:border-slate-600"
                disabled={disabled}
              />
              Featured only
            </label>
          )}
        </div>
      </div>

      {rangeInvalid && (
        <p className="mt-2 text-xs text-red-600">
          Min price is greater than max price. Adjust the range to apply a valid filter.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={reset}
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
