// src/app/not-found.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { track } from "@/app/lib/analytics";

export default function NotFound() {
  React.useEffect(() => {
    try {
      track("page_404" as any, {
        path: typeof location !== "undefined" ? location.pathname : undefined,
      });
    } catch {}
  }, []);

  const onClick = (event: string, extra?: Record<string, unknown>) => () => {
    try {
      track(event as any, { source: "404", ...extra });
    } catch {}
  };

  return (
    <div className="pb-10">
      {/* Branded hero */}
      <header
        className="bg-spotlight bg-noise text-white"
        style={{ WebkitMaskImage: "linear-gradient(to bottom, black 80%, transparent)" }}
      >
        <div className="container-page pt-12 pb-8 md:pt-14 md:pb-10">
          <p className="text-sm/5 opacity-90">Oops…</p>
          <h1 className="mt-1 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            We couldn’t find that page
          </h1>
          <p className="mt-2 max-w-prose text-sm text-white/90">
            It may have been moved or the link is broken. Try one of these instead:
          </p>

          {/* Quick chips */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/"
              prefetch={false}
              className="chip chip--light"
              onClick={onClick("page_404_go_home")}
            >
              Home
            </Link>
            <Link
              href="/search?type=product"
              prefetch={false}
              className="chip chip--light"
              onClick={onClick("page_404_chip", { to: "products" })}
            >
              Browse products
            </Link>
            <Link
              href="/search?type=service"
              prefetch={false}
              className="chip chip--light"
              onClick={onClick("page_404_chip", { to: "services" })}
            >
              Find services
            </Link>
            <Link
              href="/sell"
              prefetch={false}
              className="chip chip--light"
              onClick={onClick("page_404_chip", { to: "sell" })}
            >
              Sell an item
            </Link>
            <Link
              href="/help"
              prefetch={false}
              className="chip chip--light"
              onClick={onClick("page_404_chip", { to: "help" })}
            >
              Help Center
            </Link>
          </div>
        </div>
      </header>

      {/* Suggestions grid */}
      <div className="container-page mt-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/search"
            prefetch={false}
            className="rounded-xl border bg-white p-4 text-gray-800 shadow-sm hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            onClick={onClick("page_404_card", { to: "search" })}
          >
            <div className="text-lg font-semibold">Browse listings</div>
            <div className="text-sm text-gray-600 dark:text-slate-400">
              Products & services by category
            </div>
          </Link>

          <Link
            href="/sell"
            prefetch={false}
            className="rounded-xl border bg-white p-4 text-gray-800 shadow-sm hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            onClick={onClick("page_404_card", { to: "sell" })}
          >
            <div className="text-lg font-semibold">Sell an item</div>
            <div className="text-sm text-gray-600 dark:text-slate-400">Post your listing</div>
          </Link>

          <Link
            href="/help"
            prefetch={false}
            className="rounded-xl border bg-white p-4 text-gray-800 shadow-sm hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            onClick={onClick("page_404_card", { to: "help" })}
          >
            <div className="text-lg font-semibold">Help Center</div>
            <div className="text-sm text-gray-600 dark:text-slate-400">Safety tips & FAQs</div>
          </Link>
        </div>

        {/* Primary CTAs */}
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/"
            prefetch={false}
            className="btn-gradient-primary"
            onClick={onClick("page_404_primary", { to: "home" })}
          >
            Go home
          </Link>
          <Link
            href="/contact"
            prefetch={false}
            className="btn-outline"
            onClick={onClick("page_404_primary", { to: "contact" })}
          >
            Contact support
          </Link>
        </div>
      </div>
    </div>
  );
}
