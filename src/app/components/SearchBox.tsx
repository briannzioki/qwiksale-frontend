// src/app/components/SearchBox.tsx
"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SearchCombobox, { type ComboItem } from "@/app/components/SearchCombobox";

type SuggestionType = "name" | "brand" | "category" | "subcategory" | "service";

type SuggestionMeta = {
  type: SuggestionType;
};

const DEBOUNCE_MS = 160;

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function SearchBox({
  className = "",
  placeholder = "Search phones, cars, services…",
  autoFocus = false,
  initial = "",
}: {
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  initial?: string;
}) {
  const r = useRouter();

  const [q, setQ] = useState(initial);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const fetchSuggest = useCallback(
    async (term: string): Promise<ComboItem<SuggestionMeta>[]> => {
      const t = term.trim();
      if (!t) return [];
      const res = await fetch(`/api/products/suggest?q=${encodeURIComponent(t)}&limit=12`, {
        cache: "no-store",
      }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as
        | { items?: Array<{ label: string; value: string; type: SuggestionType }> }
        | null;

      if (!json?.items || !Array.isArray(json.items)) return [];
      return json.items.map((s, idx) => ({
        id: `${s.type}:${s.value}:${idx}`,
        label: s.label,
        meta: { type: s.type },
      }));
    },
    []
  );

  const go = useCallback(
    (raw: string, picked?: ComboItem<SuggestionMeta>) => {
      const term = raw.trim();
      const params = new URLSearchParams();

      if (picked?.meta?.type) {
        const t = picked.meta.type;
        const label = picked.label; // if you also have stable .value, put it into meta and use that

        if (t === "brand") {
          params.set("brand", label);
        } else if (t === "category") {
          params.set("category", label);
        } else if (t === "subcategory") {
          // Expect "Category • Subcategory"
          const [cat, sub] = label.split("•").map((s) => s.trim());
          if (cat) params.set("category", cat);
          if (sub) params.set("subcategory", sub);
        } else if (t === "service") {
          params.set("type", "service");
          params.set("q", label);
        } else if (t === "name") {
          params.set("q", label);
        }
      } else if (term) {
        params.set("q", term);
      }

      if (![...params.keys()].length && term) params.set("q", term);
      r.push(`/search?${params.toString()}`);
    },
    [r]
  );

  const hint = useMemo(() => {
    if (!q.trim()) return "Try: Samsung, SUVs, Mama Fua…";
    return "";
  }, [q]);

  return (
    <div className={classNames("relative w-full max-w-2xl", className)}>
      <div className="flex items-center gap-2 rounded-2xl border border-gray-300 bg-white px-3 py-2 shadow-sm transition focus-within:ring-2 focus-within:ring-brandBlue dark:border-slate-700 dark:bg-slate-900">
        <SearchIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
        {/* hidden focus proxy so you can still use autoFocus on mount */}
        <input ref={inputRef} className="hidden" autoFocus={autoFocus} aria-hidden="true" tabIndex={-1} />

        <div className="flex-1">
          <SearchCombobox<SuggestionMeta>
            value={q}
            onChange={setQ}
            onSelect={(item) => go(item.label, item)}
            fetchSuggestions={fetchSuggest}
            placeholder={placeholder}
            debounceMs={DEBOUNCE_MS}
            ariaLabel="Search products, brands, categories or services"
            renderItem={(it, active) => (
              <div
                className={classNames(
                  "flex w-full items-center justify-between gap-3 text-left",
                  active ? "text-gray-900 dark:text-slate-100" : "text-gray-700 dark:text-slate-200"
                )}
              >
                <span className="truncate">{it.label}</span>
                <span
                  className={classNames(
                    "ml-2 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    it.meta?.type === "brand" &&
                      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-200",
                    it.meta?.type === "category" &&
                      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200",
                    it.meta?.type === "subcategory" &&
                      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200",
                    it.meta?.type === "service" &&
                      "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-200",
                    it.meta?.type === "name" &&
                      "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-200"
                  )}
                >
                  {it.meta?.type}
                </span>
              </div>
            )}
          />
        </div>

        {q && (
          <button
            type="button"
            aria-label="Clear search"
            className="rounded-md px-1.5 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => setQ("")}
          >
            Clear
          </button>
        )}
        <button
          type="button"
          className="rounded-lg bg-brandNavy px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          onClick={() => go(q)}
          aria-label="Search"
        >
          Search
        </button>
      </div>

      {hint && (
        <div className="mt-1 text-xs text-gray-500 dark:text-slate-400" aria-live="polite">
          {hint}
        </div>
      )}
    </div>
  );
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M21 21l-4.3-4.3m1.3-5.2a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
