// src/app/components/Select.tsx
"use client";

import * as React from "react";

type FieldSize = "sm" | "md" | "lg"; // (alias to avoid confusion with native 'size')

export type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  size?: FieldSize;          // our sizing tokens
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
  sm: { select: "h-9 text-sm rounded-lg pl-3 pr-8", label: "text-xs", chevron: "right-2.5" },
  md: { select: "h-10 text-[0.95rem] rounded-xl pl-3.5 pr-9", label: "text-sm", chevron: "right-3" },
  lg: { select: "h-12 text-base rounded-2xl pl-4 pr-11", label: "text-sm", chevron: "right-3.5" },
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
    ref
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
              "mb-1 block font-medium text-gray-700 dark:text-slate-200",
              sz.label,
              labelSrOnly && "sr-only"
            )}
          >
            {label}
            {requiredMark ? <span className="ml-0.5 text-rose-600">*</span> : null}
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
              "w-full appearance-none bg-white dark:bg-slate-800",
              "border border-gray-300 dark:border-slate-700",
              "text-gray-900 dark:text-slate-100",
              "shadow-inner",
              "focus:outline-none focus:ring-2 ring-focus",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "transition",
              sz.select,
              className,
              invalid && "border-rose-300 dark:border-rose-700 focus:ring-rose-500/60"
            )}
            {...props}
          />

          <span
            className={cn(
              "pointer-events-none absolute inset-y-0 flex items-center text-gray-500 dark:text-slate-400",
              sz.chevron
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
              "mt-1 text-xs",
              invalid ? "text-rose-600" : "text-gray-500 dark:text-slate-400"
            )}
          >
            {message}
          </p>
        ) : null}
      </div>
    );
  }
);
Select.displayName = "Select";

export default Select;
