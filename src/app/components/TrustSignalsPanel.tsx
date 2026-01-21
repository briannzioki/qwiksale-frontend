// src/app/components/TrustSignalsPanel.tsx
"use client";

import * as React from "react";
import Link from "next/link";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const cardBase =
  "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-soft";

const mini =
  "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-4 shadow-sm";

const btn =
  "inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg)] px-3 py-2 " +
  "text-xs font-semibold text-[var(--text)] shadow-sm transition hover:bg-[var(--bg-subtle)] " +
  "focus-visible:outline-none focus-visible:ring-2 ring-focus active:scale-[.99] sm:text-sm";

function RowIcon({ kind }: { kind: "verified" | "reviews" | "report" | "admin" }) {
  const cls = "h-4 w-4";
  if (kind === "verified") {
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  }
  if (kind === "reviews") {
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M12 17.3l-5.3 3 1.4-6-4.6-4 6.1-.5L12 4l2.4 5.8 6.1.5-4.6 4 1.4 6-5.3-3Z" />
      </svg>
    );
  }
  if (kind === "report") {
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10 3h4l7 18H3L10 3Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M7 10h10" />
      <path d="M7 14h10" />
      <path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9l-3 2v-2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

export default function TrustSignalsPanel({
  className,
  title = "Trust signals",
  subtitle = "Clear cues help buyers, sellers, and carriers coordinate safely.",
}: {
  className?: string;
  title?: string;
  subtitle?: string;
}) {
  return (
    <section className={cn("space-y-3 sm:space-y-4", className)} aria-label="Trust signals panel">
      <details className={cn(cardBase, "group")} aria-label="Trust signals collapsible">
        <summary
          className={cn(
            "cursor-pointer list-none rounded-2xl p-4 sm:p-5",
            "focus-visible:outline-none focus-visible:ring-2 ring-focus",
          )}
          aria-label="Toggle trust signals"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Trust & safety
              </p>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight text-[var(--text)] sm:text-xl">
                {title}
              </h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--text)] group-open:hidden">Open</span>
              <span className="text-xs font-semibold text-[var(--text)] hidden group-open:inline">Close</span>
              <span
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-xl border",
                  "border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)] shadow-sm",
                )}
                aria-hidden="true"
                title="Toggle"
              >
                +
              </span>
            </div>
          </div>
        </summary>

        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            <div className={mini}>
              <div className="flex items-start gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm" aria-hidden>
                  <RowIcon kind="verified" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold tracking-tight text-[var(--text)]">Verified profiles</div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                    Verification and tier cues help you pick who to deal with, but always confirm details in chat.
                  </p>
                </div>
              </div>
            </div>

            <div className={mini}>
              <div className="flex items-start gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm" aria-hidden>
                  <RowIcon kind="reviews" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold tracking-tight text-[var(--text)]">Reviews</div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                    Reviews add accountability and help the community surface reliable sellers and providers.
                  </p>
                </div>
              </div>
            </div>

            <div className={mini}>
              <div className="flex items-start gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm" aria-hidden>
                  <RowIcon kind="report" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold tracking-tight text-[var(--text)]">Reporting</div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                    If something feels off, report it. Reporting helps reduce scams and improves trust for everyone.
                  </p>
                </div>
              </div>
            </div>

            <div className={mini}>
              <div className="flex items-start gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm" aria-hidden>
                  <RowIcon kind="admin" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold tracking-tight text-[var(--text)]">Admin moderation</div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                    Enforcement actions like suspensions and bans protect the platform when rules are broken.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/trust" prefetch={false} className={btn} aria-label="Open trust page">
              Trust page
            </Link>
            <Link href="/safety" prefetch={false} className={btn} aria-label="Open safety page">
              Safety tips
            </Link>
            <Link href="/report" prefetch={false} className={btn} aria-label="Report a problem">
              Report
            </Link>
          </div>
        </div>
      </details>
    </section>
  );
}
