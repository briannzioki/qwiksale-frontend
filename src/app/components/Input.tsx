"use client";
// src/app/components/Input.tsx

import * as React from "react";

type Size = "sm" | "md" | "lg";

export type InputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
> & {
  size?: Size;
  /** Show error style; also sets aria-invalid */
  invalid?: boolean;
  /** Helper or error message */
  message?: string;
  /** Optional left/right icon nodes */
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  /** Label text (renders <label>) */
  label?: string;
  /** Show required asterisk on the label */
  requiredMark?: boolean;
  /** Visually hide the label but keep it for screen readers */
  labelSrOnly?: boolean;
  /** Custom wrapper class */
  wrapperClassName?: string;
};

function cn(...xs: Array<string | undefined | false | null>) {
  return xs.filter(Boolean).join(" ");
}

const sizeMap: Record<
  Size,
  { input: string; left: string; right: string; label: string }
> = {
  sm: {
    input: "h-9 text-sm rounded-lg pl-8 pr-8",
    left: "left-2.5 text-[15px]",
    right: "right-2.5 text-[15px]",
    label: "text-xs",
  },
  md: {
    input: "h-10 text-[0.95rem] rounded-xl pl-9 pr-9",
    left: "left-3 text-[16px]",
    right: "right-3 text-[16px]",
    label: "text-sm",
  },
  lg: {
    input: "h-12 text-base rounded-2xl pl-11 pr-11",
    left: "left-3.5 text-[18px]",
    right: "right-3.5 text-[18px]",
    label: "text-sm",
  },
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      size = "md",
      invalid = false,
      message,
      iconLeft,
      iconRight,
      label,
      labelSrOnly = false,
      requiredMark,
      className,
      wrapperClassName,
      id,
      disabled,
      readOnly,
      ...props
    },
    ref,
  ) => {
    const inputId = id ?? React.useId();
    const describedBy = message ? `${inputId}-desc` : undefined;
    const sz = sizeMap[size];

    return (
      <div className={cn("w-full", wrapperClassName)}>
        {label ? (
          <label
            htmlFor={inputId}
            className={cn(
              "mb-1 block font-medium",
              "text-[var(--text)]",
              sz.label,
              labelSrOnly && "sr-only",
            )}
          >
            {label}
            {requiredMark ? (
              <span className="ml-0.5 text-rose-600">*</span>
            ) : null}
          </label>
        ) : null}

        <div className="relative">
          {iconLeft ? (
            <span
              className={cn(
                "pointer-events-none absolute inset-y-0 flex items-center",
                "text-[var(--text-muted)]",
                sz.left,
              )}
              aria-hidden
            >
              {iconLeft}
            </span>
          ) : null}

          <input
            id={inputId}
            ref={ref}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            disabled={disabled}
            readOnly={readOnly}
            className={cn(
              "w-full",
              "bg-[var(--bg-elevated)] text-[var(--text)]",
              "border border-[var(--border)]",
              "placeholder:text-[var(--text-muted)]",
              "shadow-inner",
              "focus:outline-none focus:ring-2 ring-focus",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "transition",
              sz.input,
              invalid && "border-[var(--danger)]",
              readOnly && "opacity-90",
              className,
            )}
            {...props}
          />

          {iconRight ? (
            <span
              className={cn(
                "pointer-events-none absolute inset-y-0 flex items-center",
                "text-[var(--text-muted)]",
                sz.right,
              )}
              aria-hidden
            >
              {iconRight}
            </span>
          ) : null}
        </div>

        {message ? (
          <p
            id={describedBy}
            className={cn(
              "mt-1 text-xs",
              invalid
                ? "text-[var(--danger)]"
                : "text-[var(--text-muted)]",
            )}
          >
            {message}
          </p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = "Input";

export default Input;
