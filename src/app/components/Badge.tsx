"use client";

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

/**
 * Phone-first sizing:
 * - xs screens: compact pills
 * - sm+ screens: restore larger padding/font on "sm" and "md"
 */
const sizeMap: Record<Size, string> = {
  // ✅ matches your knob: text-[11px] px-2 py-1
  xs: "text-[11px] px-2 py-1 rounded-full gap-1",

  // phone-first: compact on xs, restore at sm+
  sm: "text-[11px] px-2 py-1 rounded-full gap-1.5 sm:text-xs sm:px-2.5 sm:py-1.5",

  // slightly larger option; still phone-first and restores on sm+
  md: "text-xs px-2.5 py-1.5 rounded-full gap-2 sm:text-sm sm:px-3 sm:py-1.5",
};

/**
 * Tone → CSS var color mapping (with safe fallbacks).
 * If your theme defines --success/--warning/--danger/--info, tones will differentiate.
 * Otherwise they gracefully fall back to --accent.
 */
const toneAccentVar: Record<Tone, string> = {
  slate: "var(--text-muted)",
  green: "var(--success, var(--accent))",
  amber: "var(--warning, var(--accent))",
  rose: "var(--danger, var(--accent))",
  indigo: "var(--info, var(--accent))",
};

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
    const accent = toneAccentVar[tone];

    const variantCls =
      variant === "solid"
        ? tone === "slate"
          ? "bg-[var(--text)] text-[var(--bg)]"
          : `bg-[color:${accent}] text-[var(--bg)]`
        : variant === "outline"
          ? tone === "slate"
            ? "bg-transparent text-[var(--text)] border border-[var(--border)]"
            : `bg-transparent text-[color:${accent}] border border-[color:${accent}]`
          : // soft
            "bg-[var(--bg-subtle)] text-[var(--text)] border border-[var(--border-subtle)]";

    // glow: subtle aura; uses tone color when available, otherwise falls back safely
    const glowCls = glow
      ? tone === "slate"
        ? "ring-1 ring-[var(--border)] shadow-sm"
        : `ring-2 ring-[color:${accent}] shadow-sm`
      : "";

    const isInteractive = as !== "span";
    const hoverCls = isInteractive
      ? variant === "solid"
        ? "hover:opacity-95"
        : variant === "outline"
          ? "hover:bg-[var(--bg-subtle)]"
          : "hover:bg-[var(--bg-elevated)]"
      : "";

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
          "select-none whitespace-nowrap",
          "transition-colors",
          // ✅ touch target safety when clickable
          isInteractive && "min-h-9",
          isInteractive &&
            "focus-visible:outline-none focus-visible:ring-2 ring-focus active:scale-[.99]",
          sizeMap[size],
          variantCls,
          glowCls,
          hoverCls,
          isDisabled && "pointer-events-none opacity-60",
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
            className={cn("h-1.5 w-1.5 rounded-full", `bg-[color:${accent}]`)}
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
