"use client";
// src/app/components/Select.tsx

import * as React from "react";

type FieldSize = "sm" | "md" | "lg"; // (alias to avoid confusion with native 'size')

export type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  size?: FieldSize; // our sizing tokens
  invalid?: boolean;
  message?: string;
  label?: string;
  labelSrOnly?: boolean;
  requiredMark?: boolean;
  wrapperClassName?: string;
  /** Optional custom chevron icon; defaults to ▾ */
  chevron?: React.ReactNode;
};

function cn(...xs: Array<string | undefined | false | null>) {
  return xs.filter(Boolean).join(" ");
}

const sizeMap: Record<FieldSize, { select: string; label: string; chevron: string }> = {
  sm: {
    // already phone-friendly
    select: "h-9 text-sm rounded-lg pl-3 pr-8",
    label: "text-xs",
    chevron: "right-2.5",
  },
  md: {
    // phone-first: smaller default; restore on sm+
    select: "h-9 text-sm rounded-xl pl-3.5 pr-9 sm:h-10 sm:text-[0.95rem]",
    label: "text-xs sm:text-sm",
    chevron: "right-3",
  },
  lg: {
    // phone-first: avoid oversized fields on xs; restore on sm+
    select: "h-10 text-sm rounded-2xl pl-4 pr-11 sm:h-12 sm:text-base",
    label: "text-xs sm:text-sm",
    chevron: "right-3.5",
  },
};

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      size = "md",
      invalid = false,
      message,
      label,
      labelSrOnly,
      requiredMark,
      className,
      wrapperClassName,
      id,
      disabled,
      chevron,
      ...props
    },
    ref,
  ) => {
    const selectId = id ?? React.useId();
    const describedBy = message ? `${selectId}-desc` : undefined;
    const sz = sizeMap[size]; // now typed: FieldSize → OK

    return (
      <div className={cn("w-full", wrapperClassName)}>
        {label ? (
          <label
            htmlFor={selectId}
            className={cn(
              "mb-1 block font-medium",
              "text-[var(--text)]",
              sz.label,
              labelSrOnly && "sr-only",
            )}
          >
            {label}
            {requiredMark ? <span className="ml-0.5 text-[var(--danger)]">*</span> : null}
          </label>
        ) : null}

        <div className="relative">
          <select
            id={selectId}
            ref={ref}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            disabled={disabled}
            className={cn(
              "w-full appearance-none",
              "bg-[var(--bg-elevated)] text-[var(--text)]",
              "border border-[var(--border-subtle)]",
              "shadow-sm",
              "focus-visible:outline-none focus-visible:ring-2 ring-focus",
              "disabled:cursor-not-allowed disabled:opacity-60",
              "transition",
              "hover:bg-[var(--bg-subtle)]",
              "active:scale-[.99]",
              sz.select,
              className,
              invalid && "border-[var(--danger)]",
            )}
            {...props}
          />

          <span
            className={cn(
              "pointer-events-none absolute inset-y-0 flex items-center",
              "text-[var(--text-muted)]",
              sz.chevron,
            )}
            aria-hidden
          >
            {chevron ?? <span className="-mt-0.5 text-base">▾</span>}
          </span>
        </div>

        {message ? (
          <p
            id={describedBy}
            className={cn(
              "mt-1 text-xs leading-relaxed",
              invalid ? "text-[var(--danger)]" : "text-[var(--text-muted)]",
            )}
          >
            {message}
          </p>
        ) : null}
      </div>
    );
  },
);
Select.displayName = "Select";

export default Select;
