"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Destination = "home" | "search"; // deprecated / ignored

type CommonProps = {
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  initial?: string;
  /** Deprecated: destination is ignored; we always submit to /search */
  destination?: Destination;
};

type DefaultVariantProps = CommonProps & {
  variant?: "default";
};

type InlineVariantProps = CommonProps & {
  /** Compact inline variant that slides open; controlled by parent */
  variant: "inline";
  open: boolean;
  /** Called when user dismisses via ESC or outside click */
  onCloseAction?: () => void;
};

type Props = DefaultVariantProps | InlineVariantProps;

function classNames(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}

export default function SearchBox(props: Props) {
  const {
    className = "",
    placeholder = "Search phones, cars, services…",
    autoFocus = false,
    initial = "",
  } = props;

  const [q, setQ] = useState(initial ?? "");
  useEffect(() => setQ(initial ?? ""), [initial]);

  const isInline = props.variant === "inline";
  const inlineOpen = isInline ? (props as InlineVariantProps).open : true;
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Focus when inline opens
  useEffect(() => {
    if (!isInline || !inlineOpen) return;
    const t = setTimeout(() => {
      const input = wrapRef.current?.querySelector<HTMLInputElement>('input[type="search"]');
      input?.focus();
      input?.select?.();
    }, autoFocus ? 10 : 30);
    return () => clearTimeout(t);
  }, [isInline, inlineOpen, autoFocus]);

  // ESC closes inline variant
  useEffect(() => {
    if (!isInline || !inlineOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") (props as InlineVariantProps).onCloseAction?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isInline, inlineOpen, props]);

  const hint = useMemo(() => (!q.trim() ? "Try: Samsung, SUVs, Mama Fua…" : ""), [q]);

  const formAction = "/search";

  // Default variant → full search bar
  if (!isInline) {
    return (
      <div className={classNames("relative w-full max-w-2xl", className)} ref={wrapRef}>
        <form
          method="GET"
          action={formAction}
          aria-label="Search products, brands, categories or services"
          className="flex items-center gap-2 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 shadow-sm transition focus-within:ring-2 focus-within:ring-brandBlue"
        >
          <SearchIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />

          <input
            id="searchbox-input"
            type="search"
            role="searchbox"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500"
            autoFocus={autoFocus}
            aria-label="Search query"
          />

          {q && (
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => setQ("")}
              aria-label="Clear search"
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

  // Inline variant → compact slide-out bar
  return (
    <div
      ref={wrapRef}
      className={classNames(
        "relative overflow-hidden rounded-xl border transition-all duration-200",
        "bg-white dark:bg-slate-900",
        "border-gray-200 dark:border-white/10",
        inlineOpen ? "w-72 opacity-100 px-2 py-1.5" : "w-0 opacity-0 px-0 py-0",
        className
      )}
      style={{ willChange: "width, opacity, padding" }}
      aria-hidden={inlineOpen ? "false" : "true"}
    >
      {inlineOpen && (
        <form method="GET" action={formAction} aria-label="Quick search" className="flex items-center gap-1">
          <input
            id="inline-searchbox-input"
            type="search"
            role="searchbox"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-transparent outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500"
            aria-label="Search query"
          />

          {q && (
            <button
              type="button"
              aria-label="Clear search"
              className="rounded-md p-1.5 text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => setQ("")}
              title="Clear"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M18.3 5.71L12 12.01l-6.3-6.3-1.4 1.41 6.29 6.3-6.3 6.3 1.41 1.41 6.3-6.29 6.29 6.29 1.41-1.41-6.29-6.3 6.29-6.29z" />
              </svg>
            </button>
          )}

          <button
            type="submit"
            aria-label="Search"
            className="rounded-md p-1.5 text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800"
            title="Search"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M21 20l-5.2-5.2a7 7 0 10-1.4 1.4L20 21l1-1zM5 11a6 6 0 1112 0A6 6 0 015 11z" />
            </svg>
          </button>
        </form>
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
