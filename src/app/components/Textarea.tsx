"use client";
// src/app/components/Textarea.tsx

import * as React from "react";

type Size = "sm" | "md" | "lg";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  size?: Size;
  invalid?: boolean;
  message?: string;
  label?: string;
  labelSrOnly?: boolean;
  requiredMark?: boolean;
  wrapperClassName?: string;
};

function cn(...xs: Array<string | undefined | false | null>) {
  return xs.filter(Boolean).join(" ");
}

const sizeMap: Record<Size, { textarea: string; label: string }> = {
  sm: { textarea: "text-sm rounded-lg px-3 py-2", label: "text-xs" },
  md: { textarea: "text-[0.95rem] rounded-xl px-3.5 py-2.5", label: "text-sm" },
  lg: { textarea: "text-base rounded-2xl px-4 py-3", label: "text-sm" },
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
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
      readOnly,
      rows = 4,
      ...props
    },
    ref
  ) => {
    const textareaId = id ?? React.useId();
    const describedBy = message ? `${textareaId}-desc` : undefined;
    const sz = sizeMap[size];

    return (
      <div className={cn("w-full", wrapperClassName)}>
        {label ? (
          <label
            htmlFor={textareaId}
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

        <textarea
          id={textareaId}
          ref={ref}
          rows={rows}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          readOnly={readOnly}
          className={cn(
            // Surface
            "w-full bg-white dark:bg-slate-900/90",
            // Lighter borders per audit
            "border border-gray-200 dark:border-white/10",
            // Calm placeholder
            "placeholder:text-gray-500 dark:placeholder:text-slate-400",
            // Keep subtle depth, not heavy
            "shadow-inner/40",
            // Focus treatment consistent with inputs/buttons
            "focus:outline-none focus:ring-2 ring-focus",
            // States
            "disabled:opacity-60 disabled:cursor-not-allowed",
            "transition",
            "resize-y",
            sz.textarea,
            className,
            invalid && "border-rose-300 dark:border-rose-700 focus:ring-rose-500/60",
            readOnly && "opacity-90"
          )}
          {...props}
        />

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
Textarea.displayName = "Textarea";

export default Textarea;
