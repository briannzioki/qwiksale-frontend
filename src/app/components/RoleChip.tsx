"use client";
import * as React from "react";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type Props = {
  role: string | null | undefined;
  subscription: string | null | undefined;
  className?: string;
};

type Plan = "BASIC" | "GOLD" | "PLATINUM";

function normalizePlan(raw: unknown): Plan {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "PLATINUM") return "PLATINUM";
  if (v === "GOLD") return "GOLD";
  // Default for missing/unknown plans should be BASIC (matches your schema default).
  return "BASIC";
}

export default function RoleChip({ role, subscription, className }: Props) {
  const r = String(role ?? "").trim().toUpperCase();
  const plan = normalizePlan(subscription);

  const isSuper = r === "SUPERADMIN";
  const isAdmin = r === "ADMIN" || isSuper;

  // Labels:
  // - Admins: role labels
  // - Users: plan labels (never "USER" as the only chip; E2E expects a plan-ish label)
  let label: string;
  let aria: string;

  // Token-only palettes (no hardcoded colors)
  let palette =
    "border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-muted)]";

  if (isSuper) {
    label = "SUPERADMIN";
    aria = "Your role is SUPERADMIN";
    palette =
      "border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm";
  } else if (isAdmin) {
    label = "ADMIN";
    aria = "Your role is ADMIN";
    palette =
      "border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)]";
  } else {
    label = plan;
    aria = `Your plan is ${plan}`;

    // Slight emphasis for paid tiers, still token-based.
    if (plan === "GOLD" || plan === "PLATINUM") {
      palette =
        "border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)]";
    }
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold leading-none select-none sm:px-2.5 sm:py-1.5 sm:text-xs",
        palette,
        className,
      )}
      aria-label={aria}
      title={aria}
      data-testid="session-chip"
    >
      {label}
    </span>
  );
}
