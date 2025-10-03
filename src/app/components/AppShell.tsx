"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Header from "@/app/components/Header";

/* ------------------------ tiny event/analytics ------------------------ */
function emit(name: string, detail?: unknown) {
  // eslint-disable-next-line no-console
  console.log(`[qs:event] ${name}`, detail);
  if (typeof window !== "undefined" && "CustomEvent" in window) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}
function track(event: string, payload?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.log("[qs:track]", event, payload);
  emit("qs:track", { event, payload });
}

/* --------------------------- type narrowing --------------------------- */
type LeafName = string;
type Subcategory = { name: string; subsubcategories?: ReadonlyArray<LeafName> };
type Category = { name: string; subcategories?: ReadonlyArray<Subcategory> };

function hasSubcategories(
  cat: unknown
): cat is Category & { subcategories: ReadonlyArray<Subcategory> } {
  return !!cat && Array.isArray((cat as any).subcategories);
}

function hasSubsubcategories(
  sub: unknown
): sub is Subcategory & { subsubcategories: ReadonlyArray<LeafName> } {
  return !!sub && Array.isArray((sub as any).subsubcategories);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false); // categories drawer
  const pathname = usePathname();

  // 🔹 Lazy categories: only load when drawer opens (smaller initial bundle)
  const [cats, setCats] = useState<ReadonlyArray<Category> | null>(null);
  useEffect(() => {
    if (open && !cats) {
      import("../data/categories")
        .then((m) => setCats((m as any).categories as ReadonlyArray<Category>))
        .catch(() => setCats([]));
    }
  }, [open, cats]);

  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const liveRef = useRef<HTMLSpanElement | null>(null);

  // Announce drawer state changes for screen readers
  const announce = useCallback((msg: string) => {
    if (!liveRef.current) return;
    liveRef.current.textContent = msg;
    setTimeout(() => {
      if (liveRef.current) liveRef.current.textContent = "";
    }, 1200);
  }, []);

  // Bridge: allow header (or anywhere) to open/close the drawer via events
  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onClose = () => setOpen(false);
    window.addEventListener("qs:categories:open", onOpen as EventListener);
    window.addEventListener("qs:categories:close", onClose as EventListener);
    return () => {
      window.removeEventListener("qs:categories:open", onOpen as EventListener);
      window.removeEventListener("qs:categories:close", onClose as EventListener);
    };
  }, []);

  // Escape to close (categories)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close drawer on route change
  useEffect(() => {
    if (open) setOpen(false);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Body scroll lock + focus management + focus trap
  useEffect(() => {
    const body = document.body;

    function trapFocus(e: KeyboardEvent) {
      if (!open || e.key !== "Tab" || !drawerRef.current) return;

      const nodeList = drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      const focusable: HTMLElement[] = Array.from(nodeList);
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    if (open) {
      const prev = body.style.overflow;
      body.style.overflow = "hidden";
      closeBtnRef.current?.focus();
      announce("Categories opened");
      track("nav_categories_open");
      window.addEventListener("keydown", trapFocus);
      return () => {
        window.removeEventListener("keydown", trapFocus);
        body.style.overflow = prev;
      };
    } else {
      announce("Categories closed");
      track("nav_categories_close");
    }
  }, [open, announce]);

  const categoryHref = useCallback(
    (value: string) => `/?category=${encodeURIComponent(value)}`,
    []
  );

  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Live region for announcements */}
      <span ref={liveRef} className="sr-only" aria-live="polite" />

      {/* Skip link for a11y */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:z-[100] focus:top-3 focus:left-3 focus:bg-white focus:text-[#161748] focus:px-3 focus:py-2 focus:rounded-lg focus:shadow"
      >
        Skip to content
      </a>

      {/* Top bar */}
      <Header />

      {/* Main */}
      <main id="main" className="flex-1">
        <div className="max-w-7xl mx-auto p-5">{children}</div>
      </main>

      {/* Footer */}
      <footer
        className="mt-10 text-white"
        style={{
          backgroundImage:
            "linear-gradient(90deg, #39a0ca 0%, #478559 50%, #161748 100%)",
        }}
      >
        <div className="max-w-7xl mx-auto px-5 py-4 text-sm">
          © {year} QwikSale — Built for Kenya 🇰🇪
        </div>
      </footer>

      {/* ===== Backdrop (only when open) ===== */}
      {open && (
        <button
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
          aria-label="Close categories overlay"
        />
      )}

      {/* ===== Categories Drawer (UNMOUNTED when closed) ===== */}
      {open && (
        <aside
          ref={drawerRef}
          id="categories-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Categories"
          className="fixed left-0 top-0 z-50 h-full w-[340px] bg-slate-50 dark:bg-slate-900 shadow-2xl border-r border-gray-200 dark:border-white/10 transform transition-transform duration-300 translate-x-0"
        >
          {/* Brand strip */}
          <div
            className="h-1 w-full"
            style={{
              backgroundImage:
                "linear-gradient(90deg, #161748 0%, #478559 50%, #39a0ca 100%)",
            }}
          />

          {/* Drawer header */}
          <div className="px-5 py-4 flex items-center justify-between border-b bg-white dark:bg-slate-900 border-gray-200 dark:border-white/10">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#161748] dark:text-slate-100">
                QwikSale
              </span>
            </div>
            <button
              ref={closeBtnRef}
              onClick={() => setOpen(false)}
              className="rounded-md border border-gray-300 dark:border-white/20 px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-white/10 text-gray-800 dark:text-slate-100"
              aria-label="Close categories"
            >
              Close
            </button>
          </div>

          {/* Drawer content */}
          <div
            className="px-4 py-4 space-y-4 overflow-y-auto h-[calc(100%-56px-4px)]"
            aria-busy={open && !cats}
          >
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 px-3 py-2 border border-gray-200 dark:border-white/10 shadow-sm transition text-gray-800 dark:text-slate-100"
              prefetch={false}
            >
              <span className="inline-block h-2 w-2 rounded-full bg-[#39a0ca]" />
              All Products
            </Link>

            {!cats ? (
              <div className="text-sm text-gray-500 dark:text-slate-400 px-1">
                Loading categories…
              </div>
            ) : (
              <ul className="space-y-2" aria-label="Browse categories">
                {cats.map((cat) => {
                  const c = cat as unknown as Category;
                  return (
                    <li
                      key={c.name}
                      className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-white/10 shadow-sm"
                    >
                      <details className="group">
                        <summary className="flex items-center justify-between cursor-pointer px-3 py-2 text-gray-800 dark:text-slate-100">
                          <span className="font-medium">{c.name}</span>
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            className="transition-transform duration-200 group-open:rotate-180 text-gray-500 dark:text-slate-400"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M12 15.5l-7-7 1.4-1.4L12 12.7l5.6-5.6L19 8.5z" />
                          </svg>
                        </summary>

                        {hasSubcategories(c) && c.subcategories.length > 0 && (
                          <ul className="mt-1 border-t border-gray-100 dark:border-white/5">
                            {c.subcategories.map((sub) => {
                              const s = sub as Subcategory;
                              return (
                                <li key={s.name} className="pl-2">
                                  <details>
                                    <summary className="flex items-center justify-between cursor-pointer px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/5 text-gray-800 dark:text-slate-100">
                                      <Link
                                        href={categoryHref(s.name)}
                                        onClick={() => setOpen(false)}
                                        className="flex-1"
                                        prefetch={false}
                                      >
                                        {s.name}
                                      </Link>
                                      <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        className="text-gray-400"
                                        fill="currentColor"
                                        aria-hidden="true"
                                      >
                                        <path d="M8.6 16.6L13.2 12 8.6 7.4 10 6l6 6-6 6z" />
                                      </svg>
                                    </summary>

                                    {hasSubsubcategories(s) &&
                                      s.subsubcategories.length > 0 && (
                                        <ul className="ml-3 mb-2">
                                          {s.subsubcategories.map((leaf: LeafName) => (
                                            <li key={leaf}>
                                              <Link
                                                href={categoryHref(leaf)}
                                                onClick={() => setOpen(false)}
                                                className="block pl-3 pr-2 py-1.5 text-sm text-gray-700 dark:text-slate-300 rounded-md hover:bg-slate-50 dark:hover:bg-white/5 border-l-2 border-transparent hover:border-[#39a0ca] transition"
                                                prefetch={false}
                                              >
                                                {leaf}
                                              </Link>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                  </details>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}

            <Link
              href="/saved"
              onClick={() => setOpen(false)}
              className="inline-flex w-full items-center justify-center rounded-xl text-white font-semibold shadow hover:opacity-90 px-4 py-2.5"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, #161748 0%, #478559 50%, #39a0ca 100%)",
              }}
              prefetch={false}
            >
              View Saved Items
            </Link>
          </div>
        </aside>
      )}
    </div>
  );
}
