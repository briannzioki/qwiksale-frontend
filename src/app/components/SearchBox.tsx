"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

function normalizeQuery(raw: string): string {
  return (raw || "").replace(/^\/+/, "").trim();
}

export default function SearchBox(props: Props) {
  const router = useRouter();

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
      const input = wrapRef.current?.querySelector<HTMLInputElement>(
        'input[type="search"]',
      );
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

  const hint = useMemo(
    () => (!q.trim() ? "Try: Samsung, SUVs, Mama Fua…" : ""),
    [q],
  );

  const formAction = "/search";

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const normalized = normalizeQuery(q);
    if (normalized !== q) setQ(normalized);

    const href = normalized
      ? `/search?q=${encodeURIComponent(normalized)}`
      : "/search";

    if (isInline) (props as InlineVariantProps).onCloseAction?.();
    router.push(href);
  };

  // Default variant → full search bar
  if (!isInline) {
    return (
      <div
        className={classNames("relative w-full max-w-2xl", className)}
        ref={wrapRef}
      >
        <form
          method="GET"
          action={formAction}
          onSubmit={handleSubmit}
          aria-label="Search products, brands, categories or services"
          className={[
            "flex items-center gap-2 rounded-2xl border px-3 py-2 shadow-sm transition",
            "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)]",
            "focus-within:ring-2 focus-within:ring-focus",
          ].join(" ")}
        >
          <SearchIcon
            className="h-5 w-5 text-[var(--text-muted)]"
            aria-hidden="true"
          />

          <input
            id="searchbox-input"
            type="search"
            role="searchbox"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
            autoFocus={autoFocus}
            aria-label="Search query"
          />

          {q && (
            <button
              type="button"
              className={[
                "inline-flex h-9 items-center rounded-xl px-2.5 text-xs font-semibold transition",
                "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
                "active:scale-[.99]",
                "focus-visible:outline-none focus-visible:ring-2 ring-focus",
              ].join(" ")}
              onClick={() => setQ("")}
              aria-label="Clear search"
            >
              Clear
            </button>
          )}

          <button
            type="submit"
            className={[
              "inline-flex h-9 items-center rounded-xl border px-3 text-xs font-semibold shadow-sm transition sm:text-sm",
              "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text)]",
              "hover:bg-[var(--bg-elevated)] hover:border-[var(--border)]",
              "active:scale-[.99]",
              "focus-visible:outline-none focus-visible:ring-2 ring-focus",
            ].join(" ")}
            aria-label="Search"
          >
            Search
          </button>
        </form>

        {hint && (
          <div
            className="mt-0.5 text-[11px] text-[var(--text-muted)] sm:mt-1 sm:text-xs"
            aria-live="polite"
          >
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
        "border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
        inlineOpen
          ? "w-[min(18rem,calc(100vw-5rem))] opacity-100 px-2 py-1.5 sm:w-72"
          : "w-0 opacity-0 px-0 py-0",
        className,
      )}
      style={{ willChange: "width, opacity, padding" }}
      aria-hidden={inlineOpen ? "false" : "true"}
    >
      {inlineOpen && (
        <form
          method="GET"
          action={formAction}
          onSubmit={handleSubmit}
          aria-label="Quick search"
          className="flex items-center gap-1.5"
        >
          <input
            id="inline-searchbox-input"
            type="search"
            role="searchbox"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
            aria-label="Search query"
          />

          {q && (
            <button
              type="button"
              aria-label="Clear search"
              className={[
                "inline-flex h-9 w-9 items-center justify-center rounded-xl transition",
                "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
                "active:scale-[.99]",
                "focus-visible:outline-none focus-visible:ring-2 ring-focus",
              ].join(" ")}
              onClick={() => setQ("")}
              title="Clear"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M18.3 5.71L12 12.01l-6.3-6.3-1.4 1.41 6.29 6.3-6.3 6.3 1.41 1.41 6.3-6.29 6.29 6.29 1.41-1.41-6.29-6.3 6.29-6.29z" />
              </svg>
            </button>
          )}

          <button
            type="submit"
            aria-label="Search"
            className={[
              "inline-flex h-9 w-9 items-center justify-center rounded-xl transition",
              "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
              "active:scale-[.99]",
              "focus-visible:outline-none focus-visible:ring-2 ring-focus",
            ].join(" ")}
            title="Search"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
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
