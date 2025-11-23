"use client";
// src/app/components/Badge.tsx

import * as React from "react";

type Tone = "slate" | "green" | "amber" | "rose" | "indigo";
type Variant = "solid" | "soft" | "outline";
type Size = "xs" | "sm" | "md";

export type BadgeProps = {
  tone?: Tone;
  variant?: Variant;
  size?: Size;
  glow?: boolean; // subtle outer glow (good for “featured/verified”)
  dot?: boolean; // show a small leading dot
  icon?: React.ReactNode; // or a custom icon node
  className?: string;
  as?: "span" | "button" | "a"; // simple polymorphism without deps
  href?: string; // used when as="a"
} & React.HTMLAttributes<HTMLElement>;

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const sizeMap: Record<Size, string> = {
  xs: "text-[11px] px-2 py-0.5 rounded-full gap-1",
  sm: "text-xs px-2.5 py-1 rounded-full gap-1.5",
  md: "text-sm px-3 py-1.5 rounded-full gap-2",
};

// Tailwind color tokens per tone
const palette = {
  slate: {
    solid:
      "bg-slate-800 text-white dark:bg-slate-300 dark:text-slate-900",
    soft:
      "bg-[var(--bg-muted)] text-[var(--text)] border border-[var(--border-subtle)]",
    outline:
      "bg-transparent text-[var(--text)] border border-[var(--border-subtle)]",
    ring: "ring-slate-400/30 dark:ring-slate-300/25",
    dot: "bg-slate-500",
  },
  green: {
    solid: "bg-emerald-600 text-white",
    soft:
      "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-50 dark:border-emerald-800",
    outline:
      "text-emerald-800 border border-emerald-300 dark:text-emerald-200 dark:border-emerald-700",
    ring: "ring-emerald-400/40",
    dot: "bg-emerald-500",
  },
  amber: {
    solid: "bg-amber-500 text-amber-950 dark:text-amber-950",
    soft:
      "bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-100 dark:border-amber-800",
    outline:
      "text-amber-800 border border-amber-300 dark:text-amber-200 dark:border-amber-700",
    ring: "ring-amber-400/40",
    dot: "bg-amber-500",
  },
  rose: {
    solid: "bg-rose-600 text-white",
    soft:
      "bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-100 dark:border-rose-800",
    outline:
      "text-rose-700 border border-rose-300 dark:text-rose-200 dark:border-rose-700",
    ring: "ring-rose-400/40",
    dot: "bg-rose-500",
  },
  indigo: {
    solid: "bg-indigo-600 text-white",
    soft:
      "bg-indigo-50 text-indigo-800 border border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-100 dark:border-indigo-800",
    outline:
      "text-indigo-700 border border-indigo-300 dark:text-indigo-200 dark:border-indigo-700",
    ring: "ring-indigo-400/40",
    dot: "bg-indigo-500",
  },
} as const;

export const Badge = React.forwardRef<HTMLElement, BadgeProps>(
  (
    {
      tone = "slate",
      variant = "soft",
      size = "sm",
      glow = false,
      dot = false,
      icon,
      className,
      as = "span",
      href,
      children,
      ...rest
    },
    ref,
  ) => {
    const Comp: any = as;
    const tonePal = palette[tone];

    const variantCls =
      variant === "solid"
        ? tonePal.solid
        : variant === "outline"
          ? cn("bg-transparent", tonePal.outline)
          : tonePal.soft;

    // glow adds a faint brand-like aura; keeps it subtle
    const glowCls = glow ? cn("ring-2", tonePal.ring, "shadow-sm") : "";

    // Default button behavior: avoid accidental form submissions
    const extraProps: Record<string, any> = {};
    if (as === "a") extraProps["href"] = href;
    if (as === "button" && !(rest as any).type) extraProps["type"] = "button";

    // Disabled visual affordance (works for button[disabled] or aria-disabled)
    const isDisabled =
      (as === "button" && (rest as any).disabled) ||
      (rest as any)["aria-disabled"] === true;

    return (
      <Comp
        ref={ref}
        {...extraProps}
        className={cn(
          "inline-flex items-center font-medium leading-none",
          sizeMap[size],
          variantCls,
          glowCls,
          isDisabled && "opacity-60 pointer-events-none",
          "transition-colors",
          className,
        )}
        {...rest}
      >
        {icon ? (
          <span className="inline-flex items-center" aria-hidden>
            {icon}
          </span>
        ) : null}
        {dot && !icon ? (
          <span
            className={cn("h-1.5 w-1.5 rounded-full", tonePal.dot)}
            aria-hidden
          />
        ) : null}
        <span className="truncate">{children}</span>
      </Comp>
    );
  },
);

Badge.displayName = "Badge";

export default Badge;
