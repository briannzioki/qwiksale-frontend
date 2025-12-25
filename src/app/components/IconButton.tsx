// src/app/components/IconButton.tsx
"use client";

import * as React from "react";
import { Icon, type IconName, type IconSize } from "@/app/components/Icon";

type Variant = "ghost" | "outline" | "solid";
type Tone = "default" | "primary" | "danger";
type Size = "xs" | "sm" | "md" | "lg";

export type IconButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  icon: IconName;
  /** Optional text after the icon (keeps spacing/a11y right) */
  labelText?: React.ReactNode;
  /** For purely-icon buttons, pass srLabel for screen readers. */
  srLabel?: string;
  size?: Size;
  variant?: Variant;
  tone?: Tone;
  iconSize?: IconSize | number;
  loading?: boolean;
  /** Small counter badge (e.g., unread / saved count) */
  badgeCount?: number;
};

/**
 * Phone-first touch rule:
 * - any tappable icon/button should be >= 36px tall/wide (h-9 / w-9) or equivalent.
 *
 * We keep things visually compact by using min-h instead of forcing bigger heights,
 * and we make icon-only buttons square to avoid padding bloat.
 */
const sizeCls: Record<Size, string> = {
  xs: "min-h-9 px-2 text-xs rounded-lg",
  sm: "min-h-9 px-2.5 text-sm rounded-lg",
  md: "min-h-9 px-3 text-sm rounded-xl",
  lg: "min-h-10 px-3.5 text-base rounded-xl",
};

const iconOnlyCls: Record<Size, string> = {
  xs: "w-9 px-0",
  sm: "w-9 px-0",
  md: "w-9 px-0",
  lg: "w-10 px-0",
};

const iconGap: Record<Size, string> = {
  xs: "gap-1.5",
  sm: "gap-1.5",
  md: "gap-2",
  lg: "gap-2",
};

function classes(variant: Variant, tone: Tone) {
  const common =
    "inline-flex items-center justify-center font-semibold transition " +
    "focus-visible:outline-none focus-visible:ring-2 ring-focus " +
    "disabled:opacity-60 disabled:cursor-not-allowed " +
    "active:scale-[.99]";

  if (variant === "ghost") {
    return [
      common,
      "border border-transparent bg-transparent",
      "text-[var(--text)]",
      "hover:bg-[var(--bg-subtle)]",
    ].join(" ");
  }

  if (variant === "outline") {
    const base = [
      "border bg-[var(--bg-elevated)]",
      "text-[var(--text)]",
      "hover:bg-[var(--bg-subtle)]",
    ].join(" ");

    const toneMap: Record<Tone, string> = {
      default: `border-[var(--border-subtle)] ${base}`,
      primary: `border-[var(--border)] ${base}`,
      danger: `border-[var(--border)] ${base}`,
    };

    return `${common} ${toneMap[tone]}`;
  }

  // solid
  const base = [
    "border border-[var(--border-subtle)]",
    "bg-[var(--bg-subtle)]",
    "text-[var(--text)]",
    "shadow-sm",
    "hover:bg-[var(--bg-elevated)]",
  ].join(" ");

  const toneMap: Record<Tone, string> = {
    default: base,
    primary: base,
    danger: base,
  };

  return `${common} ${toneMap[tone]}`;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      icon,
      srLabel,
      labelText,
      size = "sm",
      variant = "outline",
      tone = "default",
      iconSize = size === "lg" ? 20 : size === "md" ? 18 : 16,
      loading = false,
      badgeCount,
      className = "",
      type = "button",
      ...btn
    },
    ref,
  ) {
    // A11y: require a label of some kind if there’s no visible text
    const needsSr = !labelText && !srLabel && !btn["aria-label"];
    if (process.env["NODE_ENV"] !== "production" && needsSr) {
      // eslint-disable-next-line no-console
      console.warn(
        "[IconButton] Provide `srLabel` or `aria-label` when rendering an icon-only button.",
      );
    }

    const aria =
      srLabel && !btn["aria-label"] ? ({ "aria-label": srLabel } as const) : undefined;

    const iconOnly = !labelText;

    return (
      <button
        ref={ref}
        type={type}
        className={[
          classes(variant, tone),
          sizeCls[size],
          iconGap[size],
          iconOnly ? iconOnlyCls[size] : "",
          "relative select-none",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...aria}
        {...btn}
        disabled={btn.disabled || loading}
      >
        {/* Icon / spinner */}
        {loading ? (
          <Icon
            name="spinner"
            aria-hidden
            className="animate-spin-slow shrink-0"
            size={iconSize}
          />
        ) : (
          <Icon name={icon} aria-hidden size={iconSize} className="shrink-0" />
        )}

        {labelText ? <span className="whitespace-nowrap">{labelText}</span> : null}

        {/* Optional badge dot / count */}
        {typeof badgeCount === "number" && badgeCount > 0 && (
          <span
            className={[
              "absolute -top-1.5 -right-1.5 inline-flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full px-1",
              "border border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
              "text-[10px] leading-none text-[var(--text)] shadow-sm",
            ].join(" ")}
            aria-label={`${badgeCount} new`}
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </button>
    );
  },
);

export default IconButton;
