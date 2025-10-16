// src/app/components/ErrorBanner.tsx
"use client";

import * as React from "react";

type Variant = "error" | "warning" | "info" | "success";

type Props = {
  /** Message content (simple) */
  message?: React.ReactNode;
  /** Or pass rich content via children */
  children?: React.ReactNode;
  /** Visual / semantic variant (affects colors + role) */
  variant?: Variant;
  /** Optional retry handler (name ends with “Action” to satisfy Next 15 rule) */
  onRetryAction?: () => void | Promise<void>;
  /** Label for the retry button */
  retryLabel?: string;
  /** Extra classes for outer wrapper */
  className?: string;
  /** Optional title, shown bold before message */
  title?: string;
};

const STYLES: Record<
  Variant,
  { wrap: string; text: string; border: string; iconColor: string }
> = {
  error: {
    wrap: "bg-red-50 dark:bg-red-900/20",
    text: "text-red-800 dark:text-red-200",
    border: "border-red-300 dark:border-red-900/40",
    iconColor: "text-red-600 dark:text-red-300",
  },
  warning: {
    wrap: "bg-amber-50 dark:bg-amber-900/20",
    text: "text-amber-800 dark:text-amber-200",
    border: "border-amber-300 dark:border-amber-900/40",
    iconColor: "text-amber-600 dark:text-amber-300",
  },
  info: {
    wrap: "bg-blue-50 dark:bg-sky-900/20",
    text: "text-blue-800 dark:text-sky-200",
    border: "border-blue-300 dark:border-sky-900/40",
    iconColor: "text-blue-600 dark:text-sky-300",
  },
  success: {
    wrap: "bg-emerald-50 dark:bg-emerald-900/20",
    text: "text-emerald-800 dark:text-emerald-200",
    border: "border-emerald-300 dark:border-emerald-900/40",
    iconColor: "text-emerald-600 dark:text-emerald-300",
  },
};

function Icon({ variant }: { variant: Variant }) {
  const cls = `${STYLES[variant].iconColor}`;
  switch (variant) {
    case "error":
      return (
        <svg
          className={`h-5 w-5 ${cls}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm1-11a1 1 0 1 0-2 0v4a1 1 0 1 0 2 0V7Zm-1 8a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z"
            clipRule="evenodd"
          />
        </svg>
      );
    case "warning":
      return (
        <svg
          className={`h-5 w-5 ${cls}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M8.257 3.099c.765-1.36 2.72-1.36 3.485 0l6.518 11.58c.75 1.333-.213 2.996-1.742 2.996H3.48c-1.53 0-2.492-1.663-1.742-2.997L8.257 3.1zM11 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1-2a1 1 0 0 1-1-1V7a1 1 0 1 1 2 0v3a1 1 0 0 1-1 1z" />
        </svg>
      );
    case "success":
      return (
        <svg
          className={`h-5 w-5 ${cls}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.707-9.293a1 1 0 0 0-1.414-1.414L9 10.586 7.707 9.293A1 1 0 0 0 6.293 10.707l2 2a1 1 0 0 0 1.414 0l4-4Z" />
        </svg>
      );
    default:
      return (
        <svg
          className={`h-5 w-5 ${cls}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M10 3a7 7 0 1 0 .001 14.001A7 7 0 0 0 10 3Zm1 10H9v-2h2v2Zm0-4H9V7h2v2Z" />
        </svg>
      );
  }
}

export default function ErrorBanner({
  message,
  children,
  variant = "error",
  onRetryAction,
  retryLabel = "Retry",
  className = "",
  title,
}: Props) {
  const v = STYLES[variant];
  const role = variant === "error" || variant === "warning" ? "alert" : "status";
  const ariaLive = role === "alert" ? "assertive" : "polite";

  return (
    <div
      role={role}
      aria-live={ariaLive as "assertive" | "polite"}
      className={[
        "rounded-lg border px-3 py-2 text-sm",
        "flex items-start gap-3",
        v.wrap,
        v.border,
        v.text,
        className,
      ].join(" ")}
    >
      <span className="mt-0.5 shrink-0">
        <Icon variant={variant} />
      </span>

      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {message ? <p className={title ? "mt-0.5" : ""}>{message}</p> : children}
      </div>

      {onRetryAction ? (
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => void onRetryAction()}
            className="btn-outline px-2 py-1 text-xs"
            aria-label={retryLabel}
          >
            {retryLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
