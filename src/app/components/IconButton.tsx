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

const sizeCls: Record<Size, string> = {
  xs: "h-7 px-2 text-xs rounded-lg",
  sm: "h-8 px-2.5 text-sm rounded-lg",
  md: "h-9 px-3 text-sm rounded-xl",
  lg: "h-10 px-3.5 text-base rounded-xl",
};

const iconGap: Record<Size, string> = {
  xs: "gap-1.5",
  sm: "gap-1.5",
  md: "gap-2",
  lg: "gap-2",
};

function classes(variant: Variant, tone: Tone) {
  const common =
    "inline-flex items-center justify-center font-semibold transition focus:outline-none focus:ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 disabled:opacity-60 disabled:cursor-not-allowed";

  if (variant === "ghost") {
    return `${common} border border-transparent bg-transparent hover:bg-black/[.06] dark:hover:bg-white/[.08]`;
  }

  if (variant === "outline") {
    const base =
      "border bg-white text-gray-900 hover:bg-gray-50 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-700/80";
    const toneMap: Record<Tone, string> = {
      default: base,
      primary:
        "border-brandBlue-300/60 text-brandBlue-700 hover:bg-brandBlue-50 dark:text-brandBlue-200 dark:border-brandBlue-700/50 dark:hover:bg-brandBlue-400/10",
      danger:
        "border-red-300/70 text-red-700 hover:bg-red-50 dark:text-red-300 dark:border-red-700/50 dark:hover:bg-red-400/10",
    };
    return `${common} ${toneMap[tone]}`;
  }

  // solid
  const base =
    "text-white shadow-sm hover:opacity-95 active:opacity-90 border border-black/5 dark:border-white/10";
  const toneMap: Record<Tone, string> = {
    default:
      "bg-gray-900 hover:bg-gray-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-100",
    primary:
      "bg-brandNavy hover:brightness-[.98] dark:bg-brandBlue-600 dark:hover:bg-brandBlue-500",
    danger: "bg-red-600 hover:bg-red-700",
  };
  return `${common} ${base} ${toneMap[tone]}`;
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
    ref
  ) {
    // A11y: require a label of some kind if there’s no visible text
    const needsSr = !labelText && !srLabel && !btn["aria-label"];
    if (process.env.NODE_ENV !== "production" && needsSr) {
      // eslint-disable-next-line no-console
      console.warn(
        "[IconButton] Provide `srLabel` or `aria-label` when rendering an icon-only button."
      );
    }

    const aria =
      srLabel && !btn["aria-label"] ? { "aria-label": srLabel } : undefined;

    return (
      <button
        ref={ref}
        type={type}
        className={[
          classes(variant, tone),
          sizeCls[size],
          iconGap[size],
          "relative select-none",
          className,
        ].join(" ")}
        {...aria}
        {...btn}
        disabled={btn.disabled || loading}
      >
        {/* Icon / spinner */}
        {loading ? (
          <Icon
            name="spinner"
            aria-hidden
            className="animate-spin-slow"
            size={iconSize}
          />
        ) : (
          <Icon name={icon} aria-hidden size={iconSize} />
        )}

        {labelText ? <span className="whitespace-nowrap">{labelText}</span> : null}

        {/* Optional badge dot / count */}
        {typeof badgeCount === "number" && badgeCount > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-[1.1rem] px-1 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] leading-none shadow"
            aria-label={`${badgeCount} new`}
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </button>
    );
  }
);

export default IconButton;
