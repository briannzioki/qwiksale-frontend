"use client";

import * as React from "react";

type Variant = "error" | "warning" | "info" | "success";

type Props = {
  message?: React.ReactNode;
  children?: React.ReactNode;
  variant?: Variant;
  onRetryAction?: () => void | Promise<void>;
  retryLabel?: string;
  className?: string;
  title?: string;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const STYLES: Record<
  Variant,
  {
    wrap: string;
    border: string;
    accent: string;
    iconColor: string;
  }
> = {
  error: {
    wrap: "bg-[var(--bg-elevated)]",
    border: "border-[var(--border-subtle)]",
    accent: "border-l-[color:var(--danger)]",
    iconColor: "text-[color:var(--danger)]",
  },
  warning: {
    wrap: "bg-[var(--bg-elevated)]",
    border: "border-[var(--border-subtle)]",
    accent: "border-l-[color:var(--warning)]",
    iconColor: "text-[color:var(--warning)]",
  },
  info: {
    wrap: "bg-[var(--bg-elevated)]",
    border: "border-[var(--border-subtle)]",
    accent: "border-l-[color:var(--info)]",
    iconColor: "text-[color:var(--info)]",
  },
  success: {
    wrap: "bg-[var(--bg-elevated)]",
    border: "border-[var(--border-subtle)]",
    accent: "border-l-[color:var(--success)]",
    iconColor: "text-[color:var(--success)]",
  },
};

function Icon({ variant }: { variant: Variant }) {
  const cls = STYLES[variant].iconColor;

  switch (variant) {
    case "error":
      return (
        <svg
          className={cn("h-5 w-5", cls)}
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
          className={cn("h-5 w-5", cls)}
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
          className={cn("h-5 w-5", cls)}
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
          className={cn("h-5 w-5", cls)}
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
      className={cn(
        "flex items-start gap-2.5 sm:gap-3",
        "rounded-xl border border-l-4 px-3 py-2 text-xs shadow-sm sm:py-2.5 sm:text-sm",
        v.wrap,
        v.border,
        v.accent,
        "text-[var(--text)]",
        className,
      )}
    >
      <span className="mt-0.5 shrink-0">
        <Icon variant={variant} />
      </span>

      <div className="min-w-0 flex-1">
        {title ? (
          <p className="font-semibold tracking-tight text-[var(--text)]">
            {title}
          </p>
        ) : null}

        {message ? (
          <p
            className={cn(
              title ? "mt-0.5" : "",
              "text-[11px] leading-relaxed text-[var(--text-muted)] sm:text-xs",
            )}
          >
            {message}
          </p>
        ) : (
          <div
            className={cn(
              title ? "mt-0.5" : "",
              "text-[11px] text-[var(--text-muted)] sm:text-xs",
            )}
          >
            {children}
          </div>
        )}
      </div>

      {onRetryAction ? (
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => void onRetryAction()}
            className={cn(
              "btn-outline",
              "min-h-9 rounded-xl px-3 py-1.5 text-xs font-semibold",
              "active:scale-[.99]",
              "focus-visible:outline-none focus-visible:ring-2 ring-focus",
            )}
            aria-label={retryLabel}
          >
            {retryLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
