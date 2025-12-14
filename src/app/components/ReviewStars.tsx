// src/app/components/ReviewStars.tsx
"use client";

import React from "react";
import { Icon } from "@/app/components/Icon";

type Size = "xs" | "sm" | "md" | "lg";

export type ReviewStarsProps = {
  /** Current rating value (0–5, decimals allowed). */
  rating?: number | null;
  /** Maximum number of stars. Defaults to 5. */
  outOf?: number;
  /** Optional rating count to display next to the stars. */
  count?: number | null;
  /** Show numeric label + count text next to stars. */
  showLabel?: boolean;
  /** Visual size of each star icon. */
  size?: Size;
  /** Additional container classes. */
  className?: string;

  /** Enable click/keyboard selection. */
  interactive?: boolean;
  /** Force read-only even if interactive=true. */
  readOnly?: boolean;
  /** Called when user selects a star (1–outOf). */
  onChangeAction?: (value: number) => void;

  /** Optional custom aria-label for screen readers. */
  "aria-label"?: string;
};

function cn(...xs: Array<string | null | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const sizeClasses: Record<Size, string> = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

function clampRating(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, value));
}

export default function ReviewStars({
  rating = 0,
  outOf = 5,
  count,
  showLabel = false,
  size = "md",
  className,
  interactive = false,
  readOnly = false,
  onChangeAction,
  "aria-label": ariaLabelProp,
}: ReviewStarsProps) {
  const max = Math.max(1, outOf);
  const value = clampRating(rating ?? 0, max);

  const label =
    ariaLabelProp ??
    `${value.toFixed(1).replace(/\.0$/, "")} out of ${max} star${
      max === 1 ? "" : "s"
    }`;

  const handleClick = (val: number) => {
    if (!interactive || readOnly || !onChangeAction) return;
    onChangeAction(val);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLButtonElement> = (
    event,
  ) => {
    if (!interactive || readOnly || !onChangeAction) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const raw = event.currentTarget.getAttribute("data-value");
      const val = raw ? Number(raw) : NaN;
      if (Number.isFinite(val)) onChangeAction(val);
    }
  };

  return (
    <div
      className={cn("inline-flex items-center gap-1", className)}
      aria-label={label}
      role={interactive ? "radiogroup" : "img"}
    >
      <div className="flex items-center gap-0.5">
        {Array.from({ length: max }).map((_, idx) => {
          const i = idx + 1;
          const filled = i <= value;
          const icon = (
            <Icon
              name="star"
              aria-hidden
              className={cn(
                sizeClasses[size],
                filled ? "text-amber-400" : "text-muted-foreground/40",
              )}
            />
          );

          if (!interactive) {
            return (
              <span key={i} className="inline-flex">
                {icon}
              </span>
            );
          }

          return (
            <button
              key={i}
              type="button"
              data-value={i}
              onClick={() => handleClick(i)}
              onKeyDown={handleKeyDown}
              role="radio"
              aria-checked={i === Math.round(value)}
              className="cursor-pointer rounded-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-brandBlue/70 focus-visible:ring-offset-2"
            >
              {icon}
              <span className="sr-only">
                {i} star{i === 1 ? "" : "s"}
              </span>
            </button>
          );
        })}
      </div>

      {showLabel && (
        <span className="text-xs font-medium text-muted-foreground">
          {value.toFixed(1).replace(/\.0$/, "")}
          {typeof count === "number" && count >= 0
            ? ` • ${count.toLocaleString()} review${
                count === 1 ? "" : "s"
              }`
            : ""}
        </span>
      )}
    </div>
  );
}
