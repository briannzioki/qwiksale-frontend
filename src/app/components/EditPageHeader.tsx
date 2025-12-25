"use client";
// src/app/components/EditPageHeader.tsx

import Link from "next/link";

type Props = {
  title: string;
  idText?: string;
  statusText?: string;
  updatedAtText?: string;
  viewHref?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  children?: React.ReactNode; // extra right-side actions
  className?: string;
};

export default function EditPageHeader({
  title,
  idText,
  statusText,
  updatedAtText,
  viewHref,
  breadcrumbs = [],
  children,
  className = "",
}: Props) {
  return (
    <div
      className={[
        // ✅ phone-first padding
        "rounded-2xl p-4 sm:p-5 md:p-6 shadow-soft dark:shadow-none",
        // ✅ keep brand gradient strip, but token-first (no hardcoded hex)
        "bg-gradient-to-r from-[var(--brand-navy)] via-[var(--brand-green)] to-[var(--brand-blue)]",
        "border border-[var(--border-subtle)] text-white",
        className,
      ].join(" ")}
    >
      {breadcrumbs.length > 0 && (
        <nav
          className="mb-1 text-[11px] text-white/80 sm:text-xs"
          aria-label="Breadcrumb"
        >
          {breadcrumbs.map((b, i) => (
            <span key={`${b.label}-${i}`}>
              {b.href ? (
                <Link
                  href={b.href}
                  className="rounded-md text-white/90 underline-offset-4 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 ring-focus"
                  prefetch={false}
                >
                  {b.label}
                </Link>
              ) : (
                <span className="text-white/90">{b.label}</span>
              )}
              {i < breadcrumbs.length - 1 && (
                <span className="mx-1 text-white/60">/</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3 min-[420px]:flex-nowrap">
        <div>
          <h1 className="text-balance text-xl font-extrabold tracking-tight text-white sm:text-2xl md:text-3xl">
            {title}
          </h1>

          <p className="mt-1 text-xs leading-relaxed text-white/80 sm:text-sm">
            {idText && (
              <>
                ID <span className="font-mono text-white/95">{idText}</span>
              </>
            )}
            {updatedAtText && (
              <>
                <span className="mx-2 text-white/60">•</span>
                Last updated{" "}
                <span className="font-medium text-white/90">{updatedAtText}</span>
              </>
            )}
            {statusText && (
              <>
                <span className="mx-2 text-white/60">•</span>
                Status <span className="font-semibold text-white/95">{statusText}</span>
              </>
            )}
          </p>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {viewHref && (
            <Link
              href={viewHref}
              className={[
                "inline-flex min-h-9 items-center justify-center",
                "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5",
                "text-xs font-semibold text-[var(--text)] sm:text-sm",
                "shadow-sm transition hover:bg-[var(--bg-subtle)] active:scale-[.99]",
                "focus-visible:outline-none focus-visible:ring-2 ring-focus",
              ].join(" ")}
              prefetch={false}
            >
              View live
            </Link>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
