// src/app/components/SearchBox.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SearchCombobox from "@/app/components/SearchCombobox";

type SuggestionType = "name" | "brand" | "category" | "subcategory" | "service";

type SuggestionMeta = {
  type: SuggestionType;
  /** Normalized machine value for this suggestion (falls back to label if absent) */
  value?: string;
  /** Parent category for subcategory suggestions (if API provides it) */
  category?: string;
  /** Normalized subcategory (if API provides it separately) */
  subcategory?: string;
};

type SuggestItem = {
  label: string;
  type: SuggestionType;
  value?: string;
  category?: string;
  subcategory?: string;
};

type ComboItem<TMeta = unknown> = {
  id: string;
  label: string;
  meta?: TMeta;
};

const DEBOUNCE_MS = 160;
const SUGGEST_LIMIT = 12;
const CACHE_MAX = 30;

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

/** Where to send the user on submit */
type Destination = "home" | "search";

type CommonProps = {
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Initial text value */
  initial?: string;
  /** Submit destination; default is "home" */
  destination?: Destination;
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
    destination = "home",
  } = props;

  const isInline = props.variant === "inline";
  const r = useRouter();

  const [q, setQ] = useState(initial);

  // keep q in sync if `initial` changes after mount (rare but safe)
  useEffect(() => {
    setQ(initial ?? "");
  }, [initial]);

  // container ref so we can focus the inner <input> when inline opens
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Prefetch the destination route (safe wrapper)
  const safePrefetch = useCallback(
    (href: string) => {
      try {
        r.prefetch?.(href);
      } catch {
        /* noop */
      }
    },
    [r]
  );

  useEffect(() => {
    safePrefetch(destination === "search" ? "/search" : "/");
  }, [safePrefetch, destination]);

  // Small in-memory suggest cache (term -> items)
  const cacheRef = useRef<Map<string, ComboItem<SuggestionMeta>[]>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // abort any in-flight on unmount
    return () => abortRef.current?.abort();
  }, []);

  const fetchJson = useCallback(
    async (url: string, signal: AbortSignal) => {
      try {
        const res = await fetch(url, { cache: "no-store", signal });
        if (!res.ok) return null;
        const json = (await res.json().catch(() => null)) as { items?: SuggestItem[] } | null;
        return json;
      } catch {
        return null;
      }
    },
    []
  );

  function mergeAndDedupe(lists: Array<{ items?: SuggestItem[] } | null>): ComboItem<SuggestionMeta>[] {
    const seen = new Set<string>();
    const out: ComboItem<SuggestionMeta>[] = [];
    let idx = 0;

    for (const j of lists) {
      const arr = j?.items ?? [];
      for (const s of arr) {
        const rawLabel = (s.label ?? "").trim();
        const normVal = (s.value ?? rawLabel).toLowerCase();
        if (!rawLabel) continue;

        const key = `${s.type}:${normVal}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Build meta without undefined fields (fixes exactOptionalPropertyTypes)
        const meta: SuggestionMeta = { type: s.type };
        if (typeof s.value === "string" && s.value.trim()) meta.value = s.value.trim();
        if (typeof s.category === "string" && s.category.trim()) meta.category = s.category.trim();
        if (typeof s.subcategory === "string" && s.subcategory.trim()) meta.subcategory = s.subcategory.trim();

        out.push({
          id: `${s.type}:${normVal}:${idx++}`,
          label: rawLabel,
          meta,
        });
      }
    }
    // enforce limit after dedupe to keep top results
    return out.slice(0, Math.max(1, Math.min(SUGGEST_LIMIT, 50)));
  }

  const fetchSuggest = useCallback(
    async (term: string): Promise<ComboItem<SuggestionMeta>[]> => {
      const t = term.trim();
      if (!t) return [];
      const key = t.toLowerCase();

      // Serve from cache if present
      const cached = cacheRef.current.get(key);
      if (cached) return cached;

      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Try unified suggest first; if unavailable, fall back to products + services
      const unifiedUrl = `/api/suggest?q=${encodeURIComponent(t)}&limit=${SUGGEST_LIMIT}`;
      const unified = await fetchJson(unifiedUrl, controller.signal);

      let items: ComboItem<SuggestionMeta>[];
      if (unified && Array.isArray(unified.items)) {
        items = mergeAndDedupe([unified]);
      } else {
        const per = Math.max(4, Math.floor(SUGGEST_LIMIT / 2));
        const prodUrl = `/api/products/suggest?q=${encodeURIComponent(t)}&limit=${per}`;
        const svcUrl = `/api/services/suggest?q=${encodeURIComponent(t)}&limit=${per}`;
        const [p, s] = await Promise.all([
          fetchJson(prodUrl, controller.signal),
          fetchJson(svcUrl, controller.signal),
        ]);
        items = mergeAndDedupe([p, s]);
      }

      // Cache (simple LRU-ish: trim oldest when > CACHE_MAX)
      cacheRef.current.set(key, items);
      if (cacheRef.current.size > CACHE_MAX) {
        const firstKey = cacheRef.current.keys().next().value as string | undefined;
        if (firstKey) cacheRef.current.delete(firstKey);
      }

      return items;
    },
    [fetchJson]
  );

  // Router push with safety; also closes inline if needed
  const safePush = useCallback(
    (href: string) => {
      try {
        r.push(href);
      } catch {
        // If router blows up, fallback to hard nav
        try {
          window.location.assign(href);
        } catch {
          /* noop */
        }
      } finally {
        if (isInline) (props as InlineVariantProps).onCloseAction?.();
      }
    },
    [r, isInline, props]
  );

  // Helpers to pick normalized/meta values safely
  const valueOr = (m?: SuggestionMeta) => (m?.value || "").trim();
  const labelOr = (lbl?: string) => (lbl || "").trim();

  const go = useCallback(
    (raw: string, picked?: ComboItem<SuggestionMeta>) => {
      const term = raw.trim();

      if (destination === "search") {
        // For the global header search: go to /search with smart mapping
        const sp = new URLSearchParams();

        const pickedType = picked?.meta?.type;

        if (pickedType === "service") {
          // Services mode
          sp.set("type", "service");
          sp.set("q", valueOr(picked?.meta) || labelOr(picked?.label) || term);
        } else if (pickedType === "brand") {
          sp.set("type", "product");
          sp.set("brand", valueOr(picked?.meta) || labelOr(picked?.label) || term);
        } else if (pickedType === "category") {
          sp.set("type", "product");
          sp.set("category", valueOr(picked?.meta) || labelOr(picked?.label) || term);
        } else if (pickedType === "subcategory") {
          sp.set("type", "product");
          // Prefer explicit parent from API if provided
          const parent = labelOr(picked?.meta?.category);
          if (parent) sp.set("category", parent);

          // Use explicit meta.subcategory/value when present, else parse from label
          const sub =
            labelOr(picked?.meta?.subcategory) ||
            valueOr(picked?.meta) ||
            labelOr(picked?.label);
          if (sub) sp.set("subcategory", sub);

          // Fallback: parse "Category • Subcategory" if parent missing
          if (!parent && picked?.label) {
            const parts = picked.label.split("•").map((s) => s.trim()).filter(Boolean);
            if (parts.length === 2) {
              sp.set("category", parts[0]!);
              sp.set("subcategory", parts[1]!);
            }
          }
        } else {
          // name / free text, or no picked item
          const qVal = picked?.label && !term ? picked.label : term || picked?.label || "";
          if (!qVal) return;
          sp.set("q", qVal);
        }

        safePush(`/search?${sp.toString()}`);
        return;
      }

      // ---------- Default: Home mode ----------
      const params = new URLSearchParams();
      let modeSet = false;

      if (picked?.meta?.type) {
        const t = picked.meta.type;
        const lbl = picked.label;

        if (t === "brand") {
          params.set("brand", valueOr(picked.meta) || lbl);
        } else if (t === "category") {
          params.set("category", valueOr(picked.meta) || lbl);
        } else if (t === "subcategory") {
          // Prefer explicit parent/subcategory from meta when available
          const parent = labelOr(picked.meta.category);
          const sub =
            labelOr(picked.meta.subcategory) ||
            valueOr(picked.meta) ||
            lbl;

          if (parent) params.set("category", parent);

          if (sub) {
            params.set("subcategory", sub);
          } else {
            // Fallback: Expect "Category • Subcategory" but handle plain "Subcategory" too
            const parts = lbl.split("•").map((s) => s.trim()).filter(Boolean);
            if (parts.length === 2) {
              params.set("category", parts[0]!);
              params.set("subcategory", parts[1]!);
            } else if (parts.length === 1) {
              params.set("subcategory", parts[0]!);
            }
          }
        } else if (t === "service") {
          params.set("t", "services");
          params.set("q", valueOr(picked.meta) || lbl || term);
          modeSet = true;
        } else if (t === "name") {
          params.set("q", valueOr(picked.meta) || lbl || term);
        }
      } else if (term) {
        params.set("q", term);
      }

      // Default mode: products (unless explicitly set to services)
      if (!modeSet && !params.has("t")) {
        params.set("t", "products");
      }

      if ([...params.keys()].length === 0 && term) {
        params.set("t", "products");
        params.set("q", term);
      }

      safePush(`/?${params.toString()}`);
    },
    [destination, safePush]
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

  // ESC to close in inline mode (delegate to parent)
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
    // Default wide search row (wrapped in a form so Enter submits reliably)
    return (
      <div className={classNames("relative w-full max-w-2xl", className)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go(q);
          }}
          className="flex items-center gap-2 rounded-2xl border border-gray-300 bg-white px-3 py-2 shadow-sm transition focus-within:ring-2 focus-within:ring-brandBlue dark:border-slate-700 dark:bg-slate-900"
          role="search"
          aria-label="Search products, brands, categories or services"
        >
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
            type="submit"
            className="rounded-lg bg-brandNavy px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
            aria-label="Search"
          >
            Search
          </button>
        </form>

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
