"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import { track } from "@/app/lib/analytics";

/* --------------------------- types --------------------------- */
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

const IS_E2E = process.env["NEXT_PUBLIC_E2E"] === "1";

export default function AppShell({
  children,
  headerSlot,
}: {
  children: React.ReactNode;
  /** Optional page-level gradient header injected by RootLayout */
  headerSlot?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false); // categories drawer
  const pathname = usePathname();
  const inAdmin = pathname?.startsWith("/admin");

  // Lazy-load categories only when needed
  const [cats, setCats] = useState<ReadonlyArray<Category> | null>(null);
  useEffect(() => {
    if (open && !cats) {
      import("../data/categories")
        .then((m) => setCats((m as any).categories as ReadonlyArray<Category>))
        .catch(() => setCats([]));
    }
  }, [open, cats]);

  // Refs for a11y management
  const drawerRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const liveRef = useRef<HTMLSpanElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null); // element that opened the drawer
  const headerRef = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const footerRef = useRef<HTMLElement | null>(null);

  // Announce changes for screen readers
  const announce = useCallback((msg: string) => {
    const node = liveRef.current;
    if (!node) return;
    node.textContent = msg;
    setTimeout(() => {
      if (node) node.textContent = "";
    }, 1200);
  }, []);

  // Open/close helpers
  const openDrawer = useCallback(() => {
    if (typeof document !== "undefined") {
      (openerRef as any).current = (document.activeElement as HTMLElement) ?? null;
    }
    setOpen(true);
  }, []);
  const closeDrawer = useCallback(() => setOpen(false), []);

  // Bridge: allow external components to open/close via events
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpen = () => openDrawer();
    const onClose = () => closeDrawer();
    window.addEventListener("qs:categories:open", onOpen as EventListener);
    window.addEventListener("qs:categories:close", onClose as EventListener);
    return () => {
      window.removeEventListener("qs:categories:open", onOpen as EventListener);
      window.removeEventListener("qs:categories:close", onClose as EventListener);
    };
  }, [openDrawer, closeDrawer]);

  // Escape to close
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDrawer();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeDrawer]);

  // Close drawer on route change
  useEffect(() => {
    if (open) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Focus trap + body scroll lock + aria-hidden on background
  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;

    function trapFocus(e: KeyboardEvent) {
      if (!open || e.key !== "Tab" || !drawerRef.current) return;

      const nodeList = drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])'
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
      const prevOverflow = body.style.overflow;
      body.style.overflow = "hidden";

      headerRef.current?.setAttribute("aria-hidden", "true");
      mainRef.current?.setAttribute("aria-hidden", "true");
      footerRef.current?.setAttribute("aria-hidden", "true");

      // focus first interactive (Close)
      closeBtnRef.current?.focus();

      announce("Categories opened");
      try {
        if (!IS_E2E) track("nav_categories_open" as any);
      } catch {}

      window.addEventListener("keydown", trapFocus);

      return () => {
        window.removeEventListener("keydown", trapFocus);
        body.style.overflow = prevOverflow;

        headerRef.current?.removeAttribute("aria-hidden");
        mainRef.current?.removeAttribute("aria-hidden");
        footerRef.current?.removeAttribute("aria-hidden");

        (openerRef.current as any)?.focus?.();
        (openerRef as any).current = null;

        announce("Categories closed");
        try {
          if (!IS_E2E) track("nav_categories_close" as any);
        } catch {}
      };
    }
  }, [open, announce]);

  const categoryHref = useCallback(
    (value: string) => `/search?type=product&category=${encodeURIComponent(value)}`,
    []
  );
  const leafHref = useCallback(
    (parent: string, leaf: string) =>
      `/search?type=product&category=${encodeURIComponent(parent)}&subcategory=${encodeURIComponent(
        leaf
      )}`,
    []
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Live region for announcements */}
      <span ref={liveRef} className="sr-only" aria-live="polite" />

      {/* Skip link for a11y */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:z-[100] focus:top-3 focus:left-3 focus:bg-white focus:text-[#161748] focus:px-3 focus:py-2 focus:rounded-lg focus:shadow dark:focus:bg-slate-900 dark:focus:text-white"
      >
        Skip to content
      </a>

      {/* âœ… Do NOT render site header in /admin â€” admin has its own layout */}
      {!inAdmin && (
        <header
          ref={headerRef as any}
          className="sticky top-0 z-header glass supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-slate-900/30"
        >
          <div className="container-page py-2">
            <Header />
          </div>
        </header>
      )}

      {/* Optional gradient/page header injected by RootLayout if desired */}
      {headerSlot ? <div className="relative">{headerSlot}</div> : null}

      {/* Main */}
      <main id="main" ref={mainRef} tabIndex={-1} className="flex-1 focus:outline-none">
        <div className="container-page py-5 md:py-6">{children}</div>
      </main>

      {/* Unified Footer */}
      <footer ref={footerRef as any} className="mt-6">
        <div className="container-page">
          <Footer />
        </div>
      </footer>

      {/* Backdrop */}
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-backdrop bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={closeDrawer}
          aria-label="Close categories overlay"
          tabIndex={-1}
        />
      )}

      {/* Categories Drawer */}
      {open && (
        <aside
          ref={drawerRef}
          id="categories-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="categories-title"
          className="fixed left-0 top-0 z-drawer h-full w-[340px] glass-strong translate-x-0 border-r border-black/10 dark:border-white/10 shadow-2xl"
        >
          {/* Brand strip */}
          <div className="h-1 w-full bg-gradient-to-r from-brandNavy-600 via-brandGreen-600 to-brandBlue-600" />

          {/* Drawer header */}
          <div className="px-5 py-4 flex items-center justify-between border-b border-black/5 dark:border-white/10">
            <div className="flex items-center gap-2">
              <h2 id="categories-title" className="font-semibold text-[#161748] dark:text-slate-100">
                Categories
              </h2>
            </div>
            <button
              type="button"
              ref={closeBtnRef}
              onClick={closeDrawer}
              className="rounded-md border border-gray-300 dark:border-white/20 px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-white/10 text-gray-800 dark:text-slate-100 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 focus:outline-none focus:ring-2 focus:ring-brandBlue-600"
              aria-label="Close categories"
              aria-controls="categories-drawer"
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
              href="/search?type=product"
              onClick={closeDrawer}
              className="flex items-center gap-2 rounded-lg bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 px-3 py-2 border border-gray-200 dark:border-white/10 shadow-sm transition text-gray-800 dark:text-slate-100"
              prefetch={false}
            >
              <span className="inline-block h-2 w-2 rounded-full bg-brandBlue-600" aria-hidden="true" />
              All Products
            </Link>

            {!cats ? (
              <div className="text-sm text-gray-500 dark:text-slate-400 px-1">Loading categoriesâ€¦</div>
            ) : (
              <ul className="space-y-2" aria-label="Browse categories">
                {cats.map((cat) => {
                  const c = cat as unknown as Category;
                  return (
                    <li
                      key={c.name}
                      className="bg-white/80 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 shadow-sm"
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

                        <div className="px-3 pt-1 pb-2">
                          <Link
                            href={categoryHref(c.name)}
                            onClick={closeDrawer}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm underline underline-offset-2"
                            prefetch={false}
                          >
                            View all {c.name}
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              className="opacity-70"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M8.6 16.6L13.2 12 8.6 7.4 10 6l6 6-6 6z" />
                            </svg>
                          </Link>
                        </div>

                        {hasSubcategories(c) && c.subcategories.length > 0 && (
                          <ul className="border-t border-gray-100 dark:border-white/5">
                            {c.subcategories.map((sub) => {
                              const s = sub as Subcategory;
                              return (
                                <li key={s.name} className="pl-2">
                                  <details>
                                    <summary className="flex items-center justify-between cursor-pointer px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/5 text-gray-800 dark:text-slate-100 rounded-md">
                                      <span className="flex-1">{s.name}</span>
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

                                    <div className="px-3 pt-1">
                                      <Link
                                        href={categoryHref(s.name)}
                                        onClick={closeDrawer}
                                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm underline underline-offset-2"
                                        prefetch={false}
                                      >
                                        View all {s.name}
                                        <svg
                                          width="14"
                                          height="14"
                                          viewBox="0 0 24 24"
                                          className="opacity-70"
                                          fill="currentColor"
                                          aria-hidden="true"
                                        >
                                          <path d="M8.6 16.6L13.2 12 8.6 7.4 10 6l6 6-6 6z" />
                                        </svg>
                                      </Link>
                                    </div>

                                    {hasSubsubcategories(s) && s.subsubcategories.length > 0 && (
                                      <ul className="ml-3 mb-2">
                                        {s.subsubcategories.map((leaf: LeafName) => (
                                          <li key={leaf}>
                                            <Link
                                              href={leafHref(s.name, leaf)}
                                              onClick={closeDrawer}
                                              className="block pl-3 pr-2 py-1.5 text-sm text-gray-700 dark:text-slate-300 rounded-md hover:bg-slate-50 dark:hover:bg-white/5 border-l-2 border-transparent hover:border-brandBlue-600 transition"
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
              onClick={closeDrawer}
              className="inline-flex w-full items-center justify-center font-semibold px-4 py-2.5 rounded-xl text-white shadow btn-gradient-primary hover:opacity-90"
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

