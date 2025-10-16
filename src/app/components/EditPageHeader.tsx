// src/app/components/EditPageHeader.tsx
"use client";

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
        "rounded-xl p-4 text-white bg-gradient-to-r from-brandNavy via-brandGreen to-brandBlue shadow-soft dark:shadow-none",
        className,
      ].join(" ")}
    >
      {breadcrumbs.length > 0 && (
        <nav className="mb-1 text-xs text-white/80" aria-label="Breadcrumb">
          {breadcrumbs.map((b, i) => (
            <span key={`${b.label}-${i}`}>
              {b.href ? (
                <Link href={b.href} className="hover:underline" prefetch={false}>
                  {b.label}
                </Link>
              ) : (
                <span>{b.label}</span>
              )}
              {i < breadcrumbs.length - 1 && <span className="mx-1">/</span>}
            </span>
          ))}
        </nav>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold">{title}</h1>
          <p className="mt-1 text-white/90 text-sm">
            {idText && (
              <>
                ID <span className="font-mono">{idText}</span>
              </>
            )}
            {updatedAtText && (
              <>
                <span className="mx-2">•</span>
                Last updated <span className="font-medium">{updatedAtText}</span>
              </>
            )}
            {statusText && (
              <>
                <span className="mx-2">•</span>
                Status <span className="font-semibold">{statusText}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {viewHref && (
            <Link
              href={viewHref}
              className="rounded-md bg-white/20 px-3 py-1.5 text-sm font-medium hover:bg-white/30"
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
