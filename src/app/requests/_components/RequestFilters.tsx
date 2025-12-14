// src/app/requests/_components/RequestFilters.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function getParam(sp: URLSearchParams | null, key: string) {
  return (sp?.get(key) || "").trim();
}

function safeKind(v: string) {
  const s = (v || "").trim().toLowerCase();
  return s === "product" || s === "service" ? s : "";
}

export default function RequestFilters({
  action = "/requests",
  className = "",
  showCta = true,
}: {
  action?: string;
  className?: string;
  showCta?: boolean;
}) {
  const sp = useSearchParams();

  const q = getParam(sp, "q");
  const kind = safeKind(getParam(sp, "kind"));
  const category = getParam(sp, "category");
  const location = getParam(sp, "location");

  const hasFilters = Boolean(q || kind || category || location);

  return (
    <form
      method="GET"
      action={action}
      data-testid="request-filters"
      className={[
        "rounded-xl border border-border bg-card/90 p-4 shadow-sm",
        className,
      ].join(" ")}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-5">
          <label className="block text-xs font-semibold text-muted-foreground">
            Search
          </label>
          <input
            name="q"
            defaultValue={q}
            placeholder="e.g. iPhone 13, plumber…"
            className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
          />
        </div>

        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-muted-foreground">
            Kind
          </label>
          <select
            name="kind"
            defaultValue={kind}
            className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
          >
            <option value="">All</option>
            <option value="product">Product</option>
            <option value="service">Service</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-muted-foreground">
            Category
          </label>
          <input
            name="category"
            defaultValue={category}
            placeholder="Any"
            className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-muted-foreground">
            Location
          </label>
          <input
            name="location"
            defaultValue={location}
            placeholder="Any"
            className="mt-1 w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-gradient-primary text-sm">
          Apply filters
        </button>

        <Link
          href={action}
          prefetch={false}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Reset
        </Link>

        {showCta && hasFilters ? (
          <Link
            href={`/requests/new?${new URLSearchParams({
              ...(kind ? { kind } : {}),
              ...(q ? { title: q } : {}),
            }).toString()}`}
            prefetch={false}
            className="ml-auto text-xs underline"
          >
            Didn’t find it? Post a request
          </Link>
        ) : null}
      </div>
    </form>
  );
}
