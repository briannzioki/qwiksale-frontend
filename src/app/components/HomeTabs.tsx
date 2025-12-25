"use client";
// src/app/components/HomeTabs.tsx

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cx, pillClass, pillGroupClass } from "@/app/components/ui/pill";

type Mode = "all" | "products" | "services";

/** Normalize search param without coupling to server logic */
function normalizeMode(raw?: string | null): Mode {
  const t = (raw ?? "all").toLowerCase();
  if (t === "products" || t === "product" || t === "prod") return "products";
  if (t === "services" || t === "service" || t === "svc" || t === "svcs") return "services";
  return "all";
}

/** Inline icons (keeps bundle simple) */
function IconAll(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <rect x="3" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="3" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <rect x="3" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="14" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconProducts(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path
        d="M3 7l9-4 9 4-9 4-9-4Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M21 7v10l-9 4-9-4V7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 11v10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconServices(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path
        d="M20 14a6 6 0 1 1-9.33-5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path d="M14 4l6 6M20 4l-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export default function HomeTabs({ className = "" }: { className?: string }) {
  const sp = useSearchParams();
  // Accept ?t= or legacy ?tab= for highlighting only.
  const mode = normalizeMode(sp.get("t") ?? sp.get("tab"));

  const isAll = mode === "all";
  const isProducts = mode === "products";
  const isServices = mode === "services";

  const tabClass = (active: boolean) =>
    pillClass({
      active,
      size: "sm",
      className: cx(
        // Phone-first: dense, equal-width tabs
        "flex-1 min-w-0 justify-center",
        "whitespace-nowrap",
        "gap-1.5",

        // ✅ tighter xs metrics; restore on sm+
        "px-2 py-1.5 text-xs",
        "min-[420px]:px-2.5",
        "sm:px-3 sm:py-2 sm:text-sm",

        // ✅ touch target: keep 36px+ height without adding padding bloat
        "min-h-9",

        "font-semibold transition",
        "focus-visible:outline-none focus-visible:ring-2 ring-focus",

        active
          ? "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm"
          : "border-[var(--border-subtle)] bg-transparent hover:bg-[var(--bg-elevated)]",
      ),
    });

  return (
    <nav
      aria-label="Feed type"
      role="tablist"
      className={pillGroupClass(
        cx(
          // ✅ phone-first: reduce vertical footprint while keeping brand + pill chrome
          "w-full bg-[var(--bg-subtle)] shadow-sm",

          // tighter wrapper padding on xs; restore on sm+
          "px-1 py-1",
          "min-[420px]:px-1.5",
          "sm:px-2 sm:py-2",

          // ✅ allow chips to “hug” content tightly
          "rounded-2xl",

          className,
        ),
      )}
      data-home-tabs
    >
      {/* ALL - href MUST be "/" */}
      <Link
        role="tab"
        aria-selected={isAll}
        aria-current={isAll ? "page" : undefined}
        href="/"
        prefetch={false}
        className={tabClass(isAll)}
        data-tab="all"
      >
        <IconAll className="h-4 w-4 shrink-0" />
        <span>All</span>
        <span className="sr-only">items</span>
      </Link>

      {/* PRODUCTS - href MUST contain "?t=products" */}
      <Link
        role="tab"
        aria-selected={isProducts}
        aria-current={isProducts ? "page" : undefined}
        href="/?t=products"
        prefetch={false}
        className={tabClass(isProducts)}
        data-tab="products"
        data-verify-href="/?t=products"
      >
        <IconProducts className="h-4 w-4 shrink-0" />
        <span>Products</span>
      </Link>

      {/* SERVICES - href MUST contain "?t=services" */}
      <Link
        role="tab"
        aria-selected={isServices}
        aria-current={isServices ? "page" : undefined}
        href="/?t=services"
        prefetch={false}
        className={tabClass(isServices)}
        data-tab="services"
        data-verify-href="/?t=services"
      >
        <IconServices className="h-4 w-4 shrink-0" />
        <span>Services</span>
      </Link>
    </nav>
  );
}
