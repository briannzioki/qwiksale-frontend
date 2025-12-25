"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Global slash ("/") search opener.
 * - If header inline form exists, ALWAYS focus it (and open if closed).
 * - Only use the overlay fallback when no header form is present.
 * - ESC closes overlay.
 * - Submit navigates with GET semantics to /search or /search?q=...
 */
export default function SearchHotkeyClient() {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  function isTargetEditable(t: EventTarget | null) {
    const el = t as HTMLElement | null;
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (el.isContentEditable) return true;
    const role = el.getAttribute?.("role");
    if (role && /^(textbox|searchbox|combobox)$/i.test(role)) return true;
    return false;
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Slash opens search if you're not typing somewhere already
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isTargetEditable(e.target)) return;

        // Prefer the inline header search if present
        const root = document.getElementById("header-inline-search");
        if (root) {
          e.preventDefault(); // don't insert "/"

          const toggle = root.querySelector<HTMLButtonElement>(
            '[data-testid="header-inline-search-toggle"]',
          );
          const input = root.querySelector<HTMLInputElement>('input[name="q"]');
          const isOpen = root.getAttribute("data-open") === "true";

          if (!isOpen && toggle) {
            toggle.click();
          }

          if (input) {
            input.focus();
            input.select?.();
          }

          return;
        }

        // Fallback overlay
        e.preventDefault();
        setOpen(true);
        queueMicrotask(() => inputRef.current?.focus());
      }

      if (e.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // overlay only; header form submits natively
    const q = inputRef.current?.value?.trim() ?? "";
    setOpen(false);
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  };

  // Click-away close for overlay
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-1 sm:top-2 z-[90] mx-auto flex justify-center"
    >
      {open && (
        <div
          ref={containerRef}
          className="pointer-events-auto w-full max-w-2xl px-3 sm:px-4"
        >
          <form
            onSubmit={onSubmit}
            aria-label="Inline search"
            className={[
              "rounded-xl border border-[var(--border-subtle)]",
              "bg-[var(--bg-elevated)] text-[var(--text)]",
              "p-1.5 sm:p-2 shadow-soft backdrop-blur",
              "transition",
              "focus-within:ring-2 ring-focus",
              "active:scale-[.99]",
            ].join(" ")}
          >
            <label htmlFor="hotkey-search" className="sr-only">
              Search
            </label>
            <input
              id="hotkey-search"
              ref={inputRef}
              name="q"
              placeholder="Search…"
              autoComplete="off"
              enterKeyHint="search"
              spellCheck={false}
              className="w-full bg-transparent p-1.5 sm:p-2 text-sm sm:text-base text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
              aria-label="Search"
            />
          </form>
        </div>
      )}
    </div>
  );
}
