// src/app/components/HeaderInlineSearch.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import SearchBox from "@/app/components/SearchBox";
import { buildSearchHref } from "@/app/lib/url";

export default function HeaderInlineSearch() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const boxWrapRef = useRef<HTMLDivElement | null>(null);
  const r = useRouter();
  const pathname = usePathname();

  // Prefetch /search for snappy nav
  useEffect(() => {
    try {
      r.prefetch?.("/search");
    } catch {
      /* noop */
    }
  }, [r]);

  // Close on route change
  useEffect(() => {
    if (open) {
      setOpen(false);
      // return focus to the trigger for a11y
      btnRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        boxWrapRef.current &&
        !boxWrapRef.current.contains(t) &&
        btnRef.current &&
        !btnRef.current.contains(t)
      ) {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? "header-inline-search" : undefined}
        aria-label={open ? "Close search" : "Open search"}
        className="inline-flex items-center gap-2 rounded-lg border border-black/10 dark:border-white/20 bg-black/5 dark:bg-white/10 px-3 py-2 text-sm text-gray-800 dark:text-slate-100 hover:bg-black/10 dark:hover:bg-white/20 transition"
        title="Search"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21 20l-5.2-5.2a7 7 0 10-1.4 1.4L20 21l1-1zM5 11a6 6 0 1112 0A6 6 0 015 11z" />
        </svg>
        <span className="hidden sm:inline">Search</span>
      </button>

      {/* Inline search box */}
      <div
        id="header-inline-search"
        ref={boxWrapRef}
        className="absolute right-0 top-[calc(100%+6px)] z-50"
      >
        <SearchBox
          variant="inline"
          open={open}
          onCloseAction={() => {
            setOpen(false);
            btnRef.current?.focus();
          }}
          placeholder="Search products & services…"
          autoFocus
          destination="search"
          className="shadow-lg"
        />
      </div>
    </div>
  );
}

/** Optional helper if you need to build links externally */
export function buildHeaderSearchLink(q?: string) {
  return buildSearchHref(q);
}
