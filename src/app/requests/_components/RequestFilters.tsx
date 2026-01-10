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
  const uid = React.useId();

  const q = getParam(sp, "q");
  const kind = safeKind(getParam(sp, "kind"));
  const category = getParam(sp, "category");
  const location = getParam(sp, "location");

  const hasFilters = Boolean(q || kind || category || location);

  const qId = `req-q-${uid}`;
  const kindId = `req-kind-${uid}`;
  const categoryId = `req-category-${uid}`;
  const locationId = `req-location-${uid}`;

  const fieldLabel = "block text-xs font-semibold text-[var(--text-muted)]";
  const inputBase =
    "mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 ring-focus";
  const selectBase =
    "mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] shadow-sm focus-visible:outline-none focus-visible:ring-2 ring-focus";

  const ctaParams = new URLSearchParams({
    ...(kind ? { kind } : {}),
    ...(q ? { title: q } : {}),
  }).toString();

  const ctaHref = ctaParams ? `/requests/new?${ctaParams}` : "/requests/new";

  return (
    <form
      method="GET"
      action={action}
      data-testid="request-filters"
      className={[
        "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-4",
        className,
      ].join(" ")}
      aria-label="Request filters"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-5">
          <label className={fieldLabel} htmlFor={qId}>
            Search
          </label>
          <input
            id={qId}
            name="q"
            defaultValue={q}
            placeholder="e.g. iPhone 13, plumber…"
            className={inputBase}
          />
        </div>

        <div className="md:col-span-3">
          <label className={fieldLabel} htmlFor={kindId}>
            Kind
          </label>
          <select id={kindId} name="kind" defaultValue={kind} className={selectBase}>
            <option value="">All</option>
            <option value="product">Product</option>
            <option value="service">Service</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className={fieldLabel} htmlFor={categoryId}>
            Category
          </label>
          <input
            id={categoryId}
            name="category"
            defaultValue={category}
            placeholder="Any"
            className={inputBase}
          />
        </div>

        <div className="md:col-span-2">
          <label className={fieldLabel} htmlFor={locationId}>
            Location
          </label>
          <input
            id={locationId}
            name="location"
            defaultValue={location}
            placeholder="Any"
            className={inputBase}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 text-xs font-semibold text-[var(--text)] shadow-sm transition hover:bg-[var(--bg-subtle)] active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus sm:px-4 sm:text-sm"
        >
          Apply filters
        </button>

        <Link
          href={action}
          prefetch={false}
          className="text-xs text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--text)]"
        >
          Reset
        </Link>

        {showCta ? (
          <Link
            href={ctaHref}
            prefetch={false}
            className="ml-auto text-xs text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--text)]"
            aria-label={hasFilters ? "Post a request with your filters" : "Post a request"}
          >
            Didn’t find it? Post a request
          </Link>
        ) : null}
      </div>
    </form>
  );
}
