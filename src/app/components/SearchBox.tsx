// src/app/components/SearchBox.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SearchCombobox from "@/app/components/SearchCombobox";

type SuggestionType = "name" | "brand" | "category" | "subcategory" | "service";
type SuggestionMeta = { type: SuggestionType };

type ComboItem<TMeta = unknown> = {
  id: string;
  label: string;
  meta?: TMeta;
};

const DEBOUNCE_MS = 160;
const SUGGEST_LIMIT = 12;
const CACHE_MAX = 30;

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type CommonProps = {
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Initial text value */
  initial?: string;
};

type DefaultVariantProps = CommonProps & {
  variant?: "default";
};

type InlineVariantProps = CommonProps & {
  /** Compact inline variant that slides open; controlled by parent */
  variant: "inline";
  open: boolean;
  /** Called when user dismisses via ESC or outside click (Header should close it) */
  onCloseAction?: () => void;
};

type Props = DefaultVariantProps | InlineVariantProps;

export default function SearchBox(props: Props) {
  const {
    className = "",
    placeholder = "Search phones, cars, services…",
    autoFocus = false,
    initial = "",
  } = props;

  const isInline = props.variant === "inline";
  const r = useRouter();

  const [q, setQ] = useState(initial);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const fetchSuggest = useCallback(
    async (term: string): Promise<ComboItem<SuggestionMeta>[]> => {
      const t = term.trim();
      if (!t) return [];

      // Serve from cache if present
      const cached = cacheRef.current.get(t);
      if (cached) return cached;

      // Abort any in-flight request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const url = `/api/products/suggest?q=${encodeURIComponent(t)}&limit=${SUGGEST_LIMIT}`;
      const res = await fetch(url, { cache: "no-store", signal: abortRef.current.signal }).catch(
        () => null
      );
      const json = (await res?.json().catch(() => null)) as
        | { items?: Array<{ label: string; value: string; type: SuggestionType }> }
        | null;

      if (!json?.items || !Array.isArray(json.items)) return [];

      // Dedupe by (type+value) to avoid repeats, keep first
      const seen = new Set<string>();
      const items: ComboItem<SuggestionMeta>[] = [];
      for (let i = 0; i < json.items.length; i++) {
        const s = json.items[i]!;
        const key = `${s.type}:${s.value}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          id: `${s.type}:${s.value}:${i}`,
          label: s.label,
          meta: { type: s.type },
        });
      }

      // Cache (simple LRU-ish: trim oldest when > CACHE_MAX)
      cacheRef.current.set(t, items);
      if (cacheRef.current.size > CACHE_MAX) {
        const firstKey = cacheRef.current.keys().next().value as string | undefined;
        if (firstKey) cacheRef.current.delete(firstKey);
      }

      return items;
    },
    []
  );

  const go = useCallback(
    (raw: string, picked?: ComboItem<SuggestionMeta>) => {
      const term = raw.trim();
      const params = new URLSearchParams();

      if (picked?.meta?.type) {
        const t = picked.meta.type;
        const label = picked.label;

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
      // For inline variant, close after navigation
      if (isInline) (props as InlineVariantProps).onCloseAction?.();
    },
    [r, isInline, props]
  );

  const hint = useMemo(() => {
    if (!q.trim()) return "Try: Samsung, SUVs, Mama Fua…";
    return "";
  }, [q]);

  // ---- Inline extras: focus + ESC close ----
  const inlineOpen = isInline ? (props as InlineVariantProps).open : true;

  // Auto-focus when inline opens (or when `autoFocus` is true on mount)
  useEffect(() => {
    if (!isInline) return;
    if (!inlineOpen) return;
    const t = setTimeout(() => {
      const input = wrapRef.current?.querySelector("input");
      if (input) (input as HTMLInputElement).focus();
    }, autoFocus ? 10 : 30);
    return () => clearTimeout(t);
  }, [isInline, inlineOpen, autoFocus]);

  // ESC to close in inline mode
  useEffect(() => {
    if (!isInline || !inlineOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") (props as InlineVariantProps).onCloseAction?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isInline, inlineOpen, props]);

  // ---- Renders ----
  if (!isInline) {
    // Default wide search row (your existing UI, unchanged)
    return (
      <div className={classNames("relative w-full max-w-2xl", className)}>
        <div className="flex items-center gap-2 rounded-2xl border border-gray-300 bg-white px-3 py-2 shadow-sm transition focus-within:ring-2 focus-within:ring-brandBlue dark:border-slate-700 dark:bg-slate-900">
          <SearchIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />

          {/* hidden focus proxy so you can still use autoFocus on mount */}
          <input className="hidden" autoFocus={autoFocus} aria-hidden="true" tabIndex={-1} />

          <div className="flex-1">
            <SearchCombobox
              value={q}
              onChangeAction={(v: string) => setQ(v)}
              onSelectAction={(item: ComboItem<SuggestionMeta>) => go(item.label, item)}
              fetchSuggestionsAction={fetchSuggest}
              placeholder={placeholder}
              debounceMs={DEBOUNCE_MS}
              ariaLabel="Search products, brands, categories or services"
              renderItemAction={(it: ComboItem<SuggestionMeta>, active: boolean) => (
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

  // Inline compact variant (collapsible, used in Header)
  return (
    <div
      ref={wrapRef}
      className={classNames(
        // animated container
        "relative overflow-hidden rounded-xl border transition-all duration-200 bg-white dark:bg-slate-900 dark:border-gray-800",
        inlineOpen ? "w-72 opacity-100 px-2 py-1.5" : "w-0 opacity-0 px-0 py-0",
        className
      )}
      style={{ willChange: "width, opacity, padding" }}
      aria-hidden={inlineOpen ? "false" : "true"}
    >
      {/* Keep combobox mounted for smoothness (hide when closed) */}
      <div className={inlineOpen ? "block" : "hidden"}>
        <SearchCombobox
          value={q}
          onChangeAction={(v: string) => setQ(v)}
          onSelectAction={(item: ComboItem<SuggestionMeta>) => go(item.label, item)}
          fetchSuggestionsAction={fetchSuggest}
          placeholder={placeholder}
          debounceMs={DEBOUNCE_MS}
          ariaLabel="Quick search"
          className="w-full"
        />
        {/* Actions row: clear + icon submit */}
        <div className="mt-1 flex items-center justify-end gap-1">
          {!!q && (
            <button
              type="button"
              aria-label="Clear"
              className="rounded-md px-1.5 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() => setQ("")}
            >
              Clear
            </button>
          )}
          <button
            type="button"
            aria-label="Search"
            className="rounded-md p-1.5 text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => go(q)}
            title="Search"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M21 20l-5.2-5.2a7 7 0 10-1.4 1.4L20 21l1-1zM5 11a6 6 0 1112 0A6 6 0 015 11z" />
            </svg>
          </button>
        </div>
      </div>
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
