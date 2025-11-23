// src/app/components/HeaderInlineSearch.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * Inline header search with a toggle + explicit navigation.
 * - Renders a <form> with a search input.
 * - On submit (Enter / button), we router.push("/search?q=…").
 * - We treat a leading "/" as the hotkey (not part of the query).
 */
export default function HeaderInlineSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus the input after opening
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => inputRef.current?.focus());
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select?.();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  // Close on Escape when open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const onToggle = () => {
    setOpen((v) => {
      const nv = !v;
      if (!v) {
        queueMicrotask(() => inputRef.current?.focus());
        window.setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select?.();
        }, 0);
      }
      return nv;
    });
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const raw = inputRef.current?.value ?? "";

    // Normalize the query:
    // - Strip any leading "/" from the hotkey.
    // - Trim whitespace.
    const normalized = raw.replace(/^\/+/, "").trim();

    setOpen(false);

    const href = normalized
      ? `/search?q=${encodeURIComponent(normalized)}`
      : "/search";
    router.push(href);
  };

  return (
    <div
      id="header-inline-search"
      ref={rootRef}
      className="relative inline-flex items-center"
      data-open={open ? "true" : "false"}
    >
      <button
        type="button"
        aria-label="Open search"
        aria-expanded={open ? "true" : "false"}
        title="Search"
        onClick={onToggle}
        className="rounded-lg px-2 py-1.5 text-[var(--text-muted)] hover:bg-subtle hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 ring-focus"
        data-testid="header-inline-search-toggle"
      >
        🔎
      </button>

      {/* Form is ALWAYS in the DOM; visibility only is toggled. */}
      <form
        action="/search"
        method="GET"
        role="search"
        aria-label="Site search"
        data-testid="header-inline-search-form"
        onSubmit={handleSubmit}
        className={[
          "absolute right-0 top-full z-50 mt-2 flex items-center gap-2 rounded-xl border px-2 py-1.5 shadow-soft backdrop-blur",
          "border-[var(--border)] bg-[var(--bg-elevated)]",
          open
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 -translate-y-1 pointer-events-none",
          "transition will-change-transform",
        ].join(" ")}
        aria-hidden={open ? "false" : "true"}
      >
        <label htmlFor="hdr-q" className="sr-only">
          Search
        </label>
        <input
          ref={inputRef}
          id="hdr-q"
          name="q"
          type="search"
          placeholder="Search products & services…"
          autoComplete="off"
          inputMode="search"
          enterKeyHint="search"
          spellCheck={false}
          aria-label="Search query"
          data-testid="header-inline-search-input"
          className="min-w-[12ch] sm:min-w-[28ch] bg-transparent outline-none text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]"
        />
        <button
          type="submit"
          className="inline-flex items-center rounded-lg px-2.5 py-1 text-sm font-medium bg-[#161748] text-white hover:opacity-95 transition focus-visible:outline-none focus-visible:ring-2 ring-focus dark:bg-[#39a0ca]"
          aria-label="Search"
          title="Search"
        >
          Search
        </button>
      </form>
    </div>
  );
}
