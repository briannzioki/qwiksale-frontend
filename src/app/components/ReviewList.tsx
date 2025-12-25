"use client";

import React, { useMemo, useState } from "react";
import ReviewItem from "@/app/components/ReviewItem";
import ReviewSummary from "@/app/components/ReviewSummary";

function cn(...xs: Array<string | null | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export type ReviewListProps = {
  reviews: any[];
  /** Optional wrapper classes. */
  className?: string;
  /** Max items to show before collapsing into “Show all”. Defaults to 4. */
  maxVisible?: number;
  /** Show summary block alongside list. */
  showSummary?: boolean;
  /** Where to place summary relative to the list. */
  summaryPlacement?: "above" | "below";
  /** Pass through handlers to individual review items. */
  onReviewEditAction?: (review: any) => void;
  onReviewDeleteAction?: (review: any) => void;
};

export function ReviewList({
  reviews,
  className,
  maxVisible = 4,
  showSummary = true,
  summaryPlacement = "above",
  onReviewEditAction,
  onReviewDeleteAction,
}: ReviewListProps) {
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(() => {
    if (!Array.isArray(reviews) || reviews.length === 0) return [];
    return [...reviews].sort((a, b) => {
      const ad = (a as any)?.createdAt;
      const bd = (b as any)?.createdAt;
      const ta = ad ? new Date(ad as any).getTime() : 0;
      const tb = bd ? new Date(bd as any).getTime() : 0;
      return tb - ta;
    });
  }, [reviews]);

  if (!sorted.length) {
    return (
      <div
        className={cn(
          "mt-3 sm:mt-4 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-4 text-xs sm:text-sm text-[var(--text-muted)]",
          className,
        )}
      >
        No reviews yet. Once buyers start sharing feedback, you’ll see it here.
      </div>
    );
  }

  const visible = expanded ? sorted : sorted.slice(0, maxVisible);
  const hasMore = sorted.length > maxVisible;

  const summaryBlock = showSummary ? <ReviewSummary reviews={sorted} /> : null;

  return (
    <section className={cn("mt-3 sm:mt-4 space-y-3 sm:space-y-4", className)}>
      {summaryPlacement === "above" && summaryBlock}

      <div className="space-y-2.5 sm:space-y-3">
        {visible.map((r: any, idx: number) => (
          <ReviewItem
            key={r?.id ?? r?.createdAt ?? idx}
            review={r}
            onEditAction={onReviewEditAction}
            onDeleteAction={onReviewDeleteAction}
          />
        ))}
      </div>

      {hasMore && (
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            className={[
              "inline-flex h-10 items-center rounded-xl border px-4 text-xs sm:text-sm font-semibold shadow-sm transition",
              "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text)]",
              "hover:bg-[var(--bg-subtle)] hover:border-[var(--border)]",
              "active:scale-[.99]",
              "focus-visible:outline-none focus-visible:ring-2 ring-focus",
            ].join(" ")}
          >
            {expanded
              ? "Show fewer reviews"
              : `Show all ${sorted.length.toLocaleString()} reviews`}
          </button>
        </div>
      )}

      {summaryPlacement === "below" && summaryBlock}
    </section>
  );
}
