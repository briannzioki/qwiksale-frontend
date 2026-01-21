"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";

function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;

  const tag = (el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;

  if ((el as any).isContentEditable) return true;

  return false;
}

/**
 * Inline header search with a toggle + explicit navigation.
 * - Desktop (md+): toggle opens a dropdown form.
 * - Mobile (xs/sm): simple link to /search (no dropdown UI).
 * - On submit (Enter / button), router.push("/search?q=…").
 * - "/" hotkey opens the search (desktop dropdown; mobile navigates to /search).
 */
export default function HeaderInlineSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus the input after opening (desktop)
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => inputRef.current?.focus());
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select?.();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  // "/" hotkey
  useEffect(() => {
    const onSlash = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key !== "/") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      e.preventDefault();

      const mq = window.matchMedia?.("(min-width: 768px)");
      const isDesktop = mq ? mq.matches : true;

      if (!isDesktop) {
        router.push("/search");
        return;
      }

      setOpen(true);
      queueMicrotask(() => inputRef.current?.focus());
      window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select?.();
      }, 0);
    };

    window.addEventListener("keydown", onSlash, true);
    return () => window.removeEventListener("keydown", onSlash, true);
  }, [router]);

  // Close on Escape when open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  // Close when clicking outside (pointer-safe)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const t = e.target as Node | null;
      if (t && root.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
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
    const normalized = raw.replace(/^\/+/, "").trim();

    setOpen(false);

    const href = normalized ? `/search?q=${encodeURIComponent(normalized)}` : "/search";
    router.push(href);
  };

  return (
    <div
      id="header-inline-search"
      ref={rootRef}
      className="relative inline-flex items-center"
      data-open={open ? "true" : "false"}
    >
      <Link
        // NOTE: query param prevents pages-wiring strict-mode from picking this md:hidden link as a[href="/search"].
        href="/search?src=header"
        prefetch={false}
        aria-label="Search"
        title="Search"
        className={[
          "md:hidden",
          "inline-flex items-center justify-center rounded-xl",
          "px-2 py-1.5",
          "text-[var(--text-muted)]",
          "hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
          "active:scale-[.99] transition",
          "focus-visible:outline-none focus-visible:ring-2 ring-focus",
        ].join(" ")}
        data-testid="header-inline-search-mobile-link"
      >
        <Icon name="search" />
      </Link>

      <button
        type="button"
        aria-label="Open search"
        aria-expanded={open ? "true" : "false"}
        title="Search"
        onClick={onToggle}
        className={[
          "hidden md:inline-flex",
          "items-center justify-center rounded-xl",
          "px-2 py-1.5",
          "text-[var(--text-muted)]",
          "hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
          "active:scale-[.99] transition",
          "focus-visible:outline-none focus-visible:ring-2 ring-focus",
        ].join(" ")}
        data-testid="header-inline-search-toggle"
      >
        <Icon name="search" />
      </button>

      <form
        action="/search"
        method="GET"
        role="search"
        aria-label="Site search"
        data-testid="header-inline-search-form"
        onSubmit={handleSubmit}
        className={[
          "hidden md:flex",
          "absolute right-0 top-full z-50 mt-2",
          "items-center gap-2",
          "w-[min(92vw,40rem)]",
          "rounded-xl border px-2 py-1.5 shadow-soft backdrop-blur",
          "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)]",
          open
            ? "opacity-100 translate-y-0 pointer-events-auto visible"
            : "opacity-0 -translate-y-1 pointer-events-none invisible",
          "transition duration-150 ease-out will-change-transform",
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
          className={[
            "flex-1 min-w-0",
            "bg-transparent px-1 outline-none",
            "text-sm text-[var(--text)]",
            "placeholder:text-[var(--text-muted)]",
          ].join(" ")}
        />

        <button
          type="submit"
          className={[
            "inline-flex shrink-0 items-center gap-1.5",
            "rounded-xl px-2.5 py-1 text-sm font-semibold",
            "border border-[var(--border-subtle)]",
            "bg-[var(--bg-subtle)] text-[var(--text)]",
            "hover:bg-[var(--bg-elevated)]",
            "active:scale-[.99] transition",
            "focus-visible:outline-none focus-visible:ring-2 ring-focus",
          ].join(" ")}
          aria-label="Search"
          title="Search"
        >
          Search
        </button>
      </form>
    </div>
  );
}
