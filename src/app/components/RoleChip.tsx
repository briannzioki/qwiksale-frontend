"use client";
import * as React from "react";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function RoleChip({
  role,
  subscription,
  className,
}: {
  role: string | null | undefined;
  subscription: string | null | undefined;
  className?: string;
}) {
  const r = (role ?? "").toUpperCase();
  const plan = (subscription ?? "").toUpperCase();

  const isSuper = r === "SUPERADMIN";
  const isAdmin = r === "ADMIN" || isSuper;

  let label = "USER";
  let aria = "Your role is USER";

  // Token-only palettes (no legacy colors)
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
  } else if (plan === "PLATINUM") {
    label = "PLATINUM";
    aria = "Your plan is PLATINUM";
    palette =
      "border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)]";
  } else if (plan === "GOLD") {
    label = "GOLD";
    aria = "Your plan is GOLD";
    palette =
      "border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)]";
  } else if (plan === "BASIC") {
    label = "BASIC";
    aria = "Your plan is BASIC";
    // keep default palette
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
      // This is the single "session chip" the E2E tests look for inside the account button.
      data-testid="session-chip"
    >
      {label}
    </span>
  );
}
