"use client";

import * as React from "react";
import Link from "next/link";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type Props = {
  className?: string;
  label?: string;
  ariaLabel?: string;
  align?: "left" | "right";
};

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
      {children}
    </div>
  );
}

function ActionLink({
  href,
  label,
  ariaLabel,
  title,
  tone = "outline",
}: {
  href: string;
  label: string;
  ariaLabel: string;
  title?: string;
  tone?: "primary" | "outline";
}) {
  const cls =
    tone === "primary"
      ? "btn-gradient-primary inline-flex min-h-9 items-center justify-center px-3 text-xs font-semibold sm:text-sm"
      : "btn-outline inline-flex min-h-9 items-center justify-center px-3 text-xs font-semibold sm:text-sm";

  return (
    <Link
      href={href}
      prefetch={false}
      className={cls}
      aria-label={ariaLabel}
      title={title}
    >
      {label}
    </Link>
  );
}

export default function EcosystemQuickActions({
  className = "",
  label = "Explore",
  ariaLabel = "Explore ecosystem actions",
  align = "left",
}: Props) {
  const panelPos = align === "right" ? "right-0" : "left-0";

  return (
    <details className={cn("group relative", className)} aria-label={ariaLabel}>
      <summary
        className={cn(
          "btn-outline cursor-pointer list-none",
          "focus-visible:outline-none focus-visible:ring-2 ring-focus",
        )}
        aria-label={ariaLabel}
      >
        {label}
      </summary>

      <div
        className={cn(
          "absolute top-[calc(100%+8px)] z-30 w-[min(520px,92vw)]",
          panelPos,
          "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 shadow-soft sm:p-4",
        )}
        role="dialog"
        aria-label="Explore menu"
      >
        <div className="flex flex-col gap-1">
          <div className="text-sm font-extrabold tracking-tight text-[var(--text)]">
            Ecosystem actions
          </div>
          <div className="text-xs leading-relaxed text-[var(--text-muted)]">
            Links are grouped to reduce clutter on Home. All routes remain available.
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 shadow-sm">
            <SectionTitle>Buy and browse</SectionTitle>
            <div className="mt-2 flex flex-wrap gap-2">
              <ActionLink
                href="/search"
                label="Browse"
                ariaLabel="Browse marketplace"
                title="Browse marketplace"
                tone="primary"
              />
              <ActionLink
                href="/requests"
                label="Requests"
                ariaLabel="Browse requests"
                title="Browse requests"
                tone="outline"
              />
            </div>
            <div className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
              Use search for products and services. Use requests when you cannot find what you need.
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 shadow-sm">
            <SectionTitle>Deliver and earn</SectionTitle>
            <div className="mt-2 flex flex-wrap gap-2">
              <ActionLink
                href="/delivery"
                label="Delivery"
                ariaLabel="Delivery"
                title="Delivery"
                tone="outline"
              />
              <ActionLink
                href="/carrier"
                label="Carrier"
                ariaLabel="Carrier"
                title="Carrier"
                tone="outline"
              />
              <ActionLink
                href="/carrier/onboarding"
                label="Onboarding"
                ariaLabel="Carrier onboarding"
                title="Carrier onboarding"
                tone="outline"
              />
            </div>
            <div className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
              Delivery and carrier routes require sign in. Carrier onboarding creates the carrier profile tied to your user.
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 shadow-sm">
            <SectionTitle>Trust and safety</SectionTitle>
            <div className="mt-2 flex flex-wrap gap-2">
              <ActionLink
                href="/trust"
                label="Trust"
                ariaLabel="Trust page"
                title="Trust page"
                tone="outline"
              />
              <ActionLink
                href="/safety"
                label="Safety"
                ariaLabel="Safety tips"
                title="Safety tips"
                tone="outline"
              />
              <ActionLink
                href="/report"
                label="Report"
                ariaLabel="Report a problem"
                title="Report a problem"
                tone="outline"
              />
            </div>
            <div className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
              Trust signals, reporting, reviews, and moderation help reduce scams and enforce rules.
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg)] p-3 shadow-sm">
            <SectionTitle>Learn</SectionTitle>
            <div className="mt-2 flex flex-wrap gap-2">
              <ActionLink
                href="/how-it-works"
                label="How it works"
                ariaLabel="How it works"
                title="How it works"
                tone="outline"
              />
              <ActionLink
                href="/help"
                label="Help"
                ariaLabel="Help Center"
                title="Help Center"
                tone="outline"
              />
            </div>
            <div className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
              Use these pages to understand journeys across marketplace, requests, delivery, and trust.
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-muted)]">
          Tip: Press the Explore button again to close this menu.
        </div>
      </div>
    </details>
  );
}
