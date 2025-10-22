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
  let palette =
    "bg-slate-100 text-slate-800 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700";

  if (isSuper) {
    label = "SUPER ADMIN";
    palette =
      "bg-indigo-100 text-indigo-800 ring-1 ring-inset ring-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-200 dark:ring-indigo-700";
  } else if (isAdmin) {
    label = "ADMIN";
    palette =
      "bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-300 dark:bg-blue-900/30 dark:text-blue-200 dark:ring-blue-700";
  } else if (plan === "PLATINUM") {
    label = "PLATINUM";
    palette =
      "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700";
  } else if (plan === "GOLD") {
    label = "GOLD";
    palette =
      "bg-yellow-100 text-yellow-900 ring-1 ring-inset ring-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200 dark:ring-yellow-700";
  } else if (plan === "BASIC") {
    label = "BASIC";
  }

  const aria =
    isSuper ? "Your role is Super Admin"
    : isAdmin ? "Your role is Admin"
    : plan ? `Your plan is ${plan}` : "Standard user";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold select-none",
        palette,
        className
      )}
      aria-label={aria}
      title={aria}
    >
      {label}
      <span className="sr-only"> chip</span>
    </span>
  );
}
