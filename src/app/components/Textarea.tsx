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
    ref,
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

        <textarea
          id={textareaId}
          ref={ref}
          rows={rows}
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
            "resize-y",
            sz.textarea,
            className,
            invalid && "border-[var(--danger)]",
            readOnly && "opacity-90",
          )}
          {...props}
        />

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
Textarea.displayName = "Textarea";

export default Textarea;
