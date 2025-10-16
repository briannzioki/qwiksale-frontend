// src/app/components/HeaderInlineSearch.tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import SearchBox from "@/app/components/SearchBox";
import { buildSearchHref } from "@/app/lib/url";
import IconButton from "@/app/components/IconButton";

export default function HeaderInlineSearch() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const lastActiveRef = useRef<HTMLElement | null>(null); // fallback if IconButton doesn't forwardRef
  const boxWrapRef = useRef<HTMLDivElement | null>(null);
  const r = useRouter();
  const pathname = usePathname();

  // -------- Helpers --------
  const close = useCallback(() => {
    setOpen(false);
    // return focus to trigger or previously focused control
    (btnRef.current || lastActiveRef.current)?.focus?.();
  }, []);

  const toggle = useCallback(() => {
    if (!open) {
      lastActiveRef.current = (document.activeElement as HTMLElement | null) ?? null;
    }
    setOpen((v) => !v);
  }, [open]);

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
    if (open) close();
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
        !(btnRef.current as unknown as Node)?.contains?.(t)
      ) {
        close();
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);

  // Close on scroll/resize (keeps header tidy on movement)
  useEffect(() => {
    if (!open) return;
    const onScroll = () => close();
    const onResize = () => close();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  // Global keyboard shortcuts: ⌘K / Ctrl+K opens, "/" opens if not typing; ESC closes
  useEffect(() => {
    const isTextInput = (el: Element | null) =>
      !!el &&
      (el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement).isContentEditable);

    const onKey = (e: KeyboardEvent) => {
      // ESC always closes if open
      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
        return;
      }
      if (e.isComposing) return;

      const active = document.activeElement;

      // ⌘K / Ctrl+K — toggle
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
        return;
      }

      // "/" opens if not already typing in an input
      if (e.key === "/" && !isTextInput(active)) {
        e.preventDefault();
        setOpen(true);
        // focus the input once open
        setTimeout(() => {
          const input = boxWrapRef.current?.querySelector("input");
          (input as HTMLInputElement | undefined)?.focus();
        }, 20);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, toggle]);

  // Simple focus trap while open (Tab cycles within trigger and input)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusables: HTMLElement[] = [];
      const input = boxWrapRef.current?.querySelector("input") as HTMLElement | null;
      const submit = boxWrapRef.current?.querySelector(
        "button[type='submit']"
      ) as HTMLElement | null;
      const clear = boxWrapRef.current?.querySelector(
        "button[aria-label='Clear']"
      ) as HTMLElement | null;

      // Collect candidates in order
      if (btnRef.current) focusables.push(btnRef.current);
      if (input) focusables.push(input);
      if (clear) focusables.push(clear);
      if (submit) focusables.push(submit);

      if (focusables.length < 2) return;

      const current = document.activeElement as HTMLElement | null;
      const idx = current ? focusables.indexOf(current) : -1;

      // Shift+Tab from first -> last; Tab from last -> first
      if (e.shiftKey && idx === 0) {
        e.preventDefault();
        focusables[focusables.length - 1]?.focus();
      } else if (!e.shiftKey && idx === focusables.length - 1) {
        e.preventDefault();
        focusables[0]?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="relative">
      <div className="inline-flex items-center gap-1.5">
        <IconButton
          ref={btnRef}
          type="button"
          icon="search"
          variant="outline"
          tone="default"
          size="sm"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="header-inline-search"
          aria-haspopup="dialog"
          // Visible label on sm+ for clarity; SR label covers icon-only case on xs
          labelText={<span className="hidden sm:inline">Search</span>}
          srLabel={open ? "Close search" : "Open search"}
          title="Search"
        />
        <kbd className="ml-0.5 hidden sm:inline-flex items-center rounded border px-1 text-[10px] text-gray-600 dark:text-slate-300 dark:border-white/20">
          ⌘K
        </kbd>
      </div>

      {/* Backdrop for small screens (click to dismiss) */}
      {open && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={close}
          className="fixed inset-0 z-[49] hidden bg-black/20 backdrop-blur-[1px] sm:block md:hidden"
        />
      )}

      {/* Inline search box */}
      <div
        id="header-inline-search"
        ref={boxWrapRef}
        role={open ? "dialog" : undefined}
        aria-label={open ? "Search" : undefined}
        aria-hidden={open ? undefined : true}
        className="absolute right-0 top-[calc(100%+6px)] z-50"
        style={{ display: open ? "block" : "none" }}
      >
        <SearchBox
          variant="inline"
          open={open}
          onCloseAction={close}
          placeholder="Search products & services…"
          autoFocus
          destination="search"
          className="shadow-lg glass-strong"
        />
      </div>
    </div>
  );
}

/** Optional helper if you need to build links externally */
export function buildHeaderSearchLink(q?: string) {
  return buildSearchHref(q);
}
