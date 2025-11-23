// src/app/components/Button.tsx
"use client";

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
  "focus:outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 ring-focus " +
  "disabled:opacity-60 disabled:cursor-not-allowed relative";

const sizeMap: Record<Size, string> = {
  xs: "text-[12px] px-2.5 py-1.5 rounded-lg gap-1.5",
  sm: "text-sm px-3 py-2 rounded-xl gap-2",
  md: "text-sm px-4 py-2.5 rounded-2xl gap-2",
  lg: "text-base px-5 py-3 rounded-3xl gap-2.5",
};

const variantMap: Record<Variant, string> = {
  // keep gradient primary as-is, tokens drive the colors via globals
  primary:
    "text-primary-foreground shadow-soft btn-gradient-primary hover:opacity-90 active:opacity-100",

  // Token-based solid outline button
  outline:
    "bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border-subtle)] " +
    "hover:bg-subtle shadow-sm",

  // Ghost button – text uses tokens, hover uses subtle surface token
  ghost:
    "bg-transparent text-[var(--text)] hover:bg-subtle",

  // Slightly filled, still token-based surface
  subtle:
    "bg-subtle text-[var(--text)] border border-[var(--border-subtle)] " +
    "hover:bg-[var(--bg-elevated)] shadow-sm",

  // Danger uses semantic error tokens for background/border
  danger:
    "text-primary-foreground bg-[var(--danger)] border border-[var(--danger-soft)] " +
    "hover:brightness-105 active:brightness-95 shadow-sm",
};

function isSingleElementNode(
  children: React.ReactNode,
): children is React.ReactElement {
  return (
    React.isValidElement(children) &&
    !Array.isArray(children) &&
    children.type !== React.Fragment
  );
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
    ref,
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
      className,
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
        type={
          (type as React.ButtonHTMLAttributes<HTMLButtonElement>["type"]) ??
          "button"
        }
        className={classes}
        disabled={isDisabled}
        aria-busy={loading ? "true" : "false"}
        {...(restProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {/* Loading overlay spinner */}
        {loading && (
          <span
            className="absolute inset-0 grid place-items-center rounded-[inherit]"
            aria-hidden="true"
          >
            <svg
              className="h-4 w-4 animate-spin-slow"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="3"
                opacity="0.25"
              />
              <path
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </span>
        )}

        {/* Content (dim when loading so spinner reads) */}
        <span
          className={cn(
            "inline-flex items-center gap-2",
            loading && "opacity-0",
          )}
        >
          {iconLeft ? <span aria-hidden>{iconLeft}</span> : null}
          <span>{children}</span>
          {iconRight ? <span aria-hidden>{iconRight}</span> : null}
        </span>
      </button>
    );
  },
);

Button.displayName = "Button";
