"use client";
// src/app/components/Button.tsx

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

type Variant = "primary" | "outline" | "ghost" | "subtle" | "danger";
type Size = "xs" | "sm" | "md" | "lg";

export type ButtonProps = {
  asChild?: boolean;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

// tiny class combiner (avoid extra deps)
function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const base =
  "inline-flex items-center justify-center select-none whitespace-nowrap font-semibold transition " +
  "focus:outline-none ring-offset-2 ring-offset-white dark:ring-offset-slate-900 focus-visible:ring-2 ring-focus " +
  "disabled:opacity-60 disabled:cursor-not-allowed relative";

const sizeMap: Record<Size, string> = {
  xs: "text-[12px] px-2.5 py-1.5 rounded-lg gap-1.5",
  sm: "text-sm px-3 py-2 rounded-xl gap-2",
  md: "text-sm px-4 py-2.5 rounded-2xl gap-2",
  lg: "text-base px-5 py-3 rounded-3xl gap-2.5",
};

const variantMap: Record<Variant, string> = {
  // keep gradient primary as-is
  primary: "text-white shadow-soft btn-gradient-primary hover:opacity-90 active:opacity-100",

  // lighter borders to match the lighter glass header
  outline:
    "bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 " +
    "border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700",

  ghost: "bg-transparent text-gray-800 dark:text-slate-100 hover:bg-gray-100/60 dark:hover:bg-white/10",

  subtle:
    "bg-white/80 dark:bg-white/5 text-gray-900 dark:text-slate-100 " +
    "border border-gray-200 dark:border-white/10 hover:bg-white dark:hover:bg-white/10 shadow-sm",

  danger:
    "text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-700 " +
    "shadow-sm border border-rose-700/40 dark:border-rose-500/40",
};

function isSingleElementNode(children: React.ReactNode): children is React.ReactElement {
  return React.isValidElement(children) && !Array.isArray(children) && children.type !== React.Fragment;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      asChild,
      variant = "primary",
      size = "md",
      loading = false,
      fullWidth = false,
      iconLeft,
      iconRight,
      className,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;
    const useSlot = !!asChild && isSingleElementNode(children);

    // Split out `type` so we only pass it when we render a real <button>
    const { type, ...restProps } = props;

    const classes = cn(
      base,
      sizeMap[size],
      variantMap[variant],
      fullWidth && "w-full",
      // Make non-button elements reflect disabled state visually
      "aria-disabled:opacity-60 aria-disabled:cursor-not-allowed",
      className
    );

    if (useSlot) {
      // Slot path: cannot inject spinner/icons; include them inside the child when using `asChild`.
      return (
        <Slot
          // ts-expect-error Slot can forward to non-button; ref is fine at runtime
          ref={ref}
          className={classes}
          aria-busy={loading ? "true" : "false"}
          aria-disabled={isDisabled || undefined}
          data-loading={loading ? "" : undefined}
          {...restProps}
        >
          {children}
        </Slot>
      );
    }

    // Native <button> path (we can render spinner + icon wrappers safely)
    return (
      <button
        ref={ref}
        type={(type as React.ButtonHTMLAttributes<HTMLButtonElement>["type"]) ?? "button"}
        className={classes}
        disabled={isDisabled}
        aria-busy={loading ? "true" : "false"}
        {...(restProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {/* Loading overlay spinner */}
        {loading && (
          <span className="absolute inset-0 grid place-items-center rounded-[inherit]" aria-hidden="true">
            <svg className="h-4 w-4 animate-spin-slow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </span>
        )}

        {/* Content (dim when loading so spinner reads) */}
        <span className={cn("inline-flex items-center gap-2", loading && "opacity-0")}>
          {iconLeft ? <span aria-hidden>{iconLeft}</span> : null}
          <span>{children}</span>
          {iconRight ? <span aria-hidden>{iconRight}</span> : null}
        </span>
      </button>
    );
  }
);

Button.displayName = "Button";
