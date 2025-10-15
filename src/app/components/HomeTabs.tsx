// src/app/components/HomeTabs.tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

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
      <path d="M3 7l9-4 9 4-9 4-9-4Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M21 7v10l-9 4-9-4V7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 11v10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
function IconServices(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path d="M20 14a6 6 0 1 1-9.33-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M14 4l6 6M20 4l-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export default function HomeTabs({ className = "" }: { className?: string }) {
  const sp = useSearchParams();
  // Accept ?t= or legacy ?tab= for highlighting only.
  const mode = normalizeMode(sp.get("t") ?? sp.get("tab"));

  const baseTab =
    "relative inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39a0ca] focus-visible:ring-offset-2 " +
    "focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900";

  const selectedTab =
    "bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue text-white border-transparent shadow-sm shadow-brandNavy/20";

  const unselectedTab =
    "bg-white/70 dark:bg-white/5 border-black/10 dark:border-white/10 hover:bg-white/90 dark:hover:bg-white/10 text-gray-800 dark:text-slate-100";

  return (
    <nav
      aria-label="Feed type"
      role="tablist"
      className={[
        "inline-flex items-center gap-1 rounded-2xl border border-black/5 dark:border-white/10",
        "bg-white/60 dark:bg-white/[0.03] backdrop-blur shadow-sm",
        "p-1",
        className,
      ].join(" ")}
      data-home-tabs
    >
      {/* ALL — href MUST be "/" */}
      <Link
        role="tab"
        aria-selected={mode === "all"}
        aria-current={mode === "all" ? "page" : undefined}
        href="/"
        prefetch={false}
        className={`${baseTab} ${mode === "all" ? selectedTab : unselectedTab}`}
        data-tab="all"
        // DOM sanity: real anchor with literal href="/"
      >
        <IconAll className="h-4 w-4" />
        <span>All</span>
        <span className="sr-only">items</span>
      </Link>

      {/* PRODUCTS — href MUST contain "?t=products" */}
      <Link
        role="tab"
        aria-selected={mode === "products"}
        aria-current={mode === "products" ? "page" : undefined}
        href="/?t=products"
        prefetch={false}
        className={`${baseTab} ${mode === "products" ? selectedTab : unselectedTab}`}
        data-tab="products"
        data-verify-href="/?t=products" /* helps tests assert correct href */
      >
        <IconProducts className="h-4 w-4" />
        <span>Products</span>
      </Link>

      {/* SERVICES — href MUST contain "?t=services" */}
      <Link
        role="tab"
        aria-selected={mode === "services"}
        aria-current={mode === "services" ? "page" : undefined}
        href="/?t=services"
        prefetch={false}
        className={`${baseTab} ${mode === "services" ? selectedTab : unselectedTab}`}
        data-tab="services"
        data-verify-href="/?t=services"
      >
        <IconServices className="h-4 w-4" />
        <span>Services</span>
      </Link>
    </nav>
  );
}
