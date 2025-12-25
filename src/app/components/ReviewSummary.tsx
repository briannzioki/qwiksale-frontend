"use client";

import React, { useMemo } from "react";
import ReviewStars from "@/app/components/ReviewStars";

function cn(...xs: Array<string | null | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export type ReviewSummaryProps = {
  /** Optional raw reviews; we’ll compute stats from .rating. */
  reviews?: any[];
  /** Precomputed average rating (if you don’t want us to compute). */
  average?: number | null;
  /** Precomputed review count. */
  count?: number | null;
  /**
   * Optional per-star breakdown (e.g. {5: 10, 4: 3,…}).
   * If omitted, it’s computed from `reviews`.
   */
  breakdown?: Partial<Record<number, number>>;
  /** Visual density: "md" = full card, "sm" = compact pill. */
  size?: "sm" | "md";
  /** Optional hint fields - ignored here but allowed for callers. */
  listingId?: string;
  listingType?: string;
  /** Optional loading state for first fetch/reload. */
  loading?: boolean;
  className?: string;
};

export default function ReviewSummary({
  reviews = [],
  average,
  count,
  breakdown,
  size = "md",
  loading = false,
  className,
}: ReviewSummaryProps) {
  const { avg, total, dist } = useMemo(() => {
    const usableRatings =
      reviews && reviews.length
        ? reviews
            .map((r) => Number((r as any)?.rating))
            .filter((n) => Number.isFinite(n) && n > 0 && n <= 5)
        : [];

    const baseCount =
      typeof count === "number" && count >= 0 ? count : usableRatings.length;

    const baseAvg =
      typeof average === "number" && Number.isFinite(average)
        ? average
        : usableRatings.length
          ? usableRatings.reduce((a, b) => a + b, 0) / usableRatings.length
          : 0;

    const baseDist: Partial<Record<number, number>> =
      breakdown && Object.keys(breakdown).length
        ? breakdown
        : usableRatings.reduce((acc, n) => {
            const star = Math.round(n);
            acc[star] = (acc[star] || 0) + 1;
            return acc;
          }, {} as Partial<Record<number, number>>);

    return {
      avg: baseAvg,
      total: baseCount,
      dist: baseDist,
    };
  }, [reviews, average, count, breakdown]);

  // Explicit loading state - avoids flashing “No reviews yet” while fetching
  if (loading) {
    const baseClasses =
      size === "sm"
        ? "inline-flex items-center rounded-full border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-muted)]"
        : "rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-4 text-xs sm:text-sm text-[var(--text-muted)]";

    return <div className={cn(baseClasses, className)}>Loading reviews…</div>;
  }

  if (!total || total <= 0 || !Number.isFinite(avg) || avg <= 0) {
    const baseClasses =
      size === "sm"
        ? "inline-flex items-center rounded-full border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-muted)]"
        : "rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-4 text-xs sm:text-sm text-[var(--text-muted)]";

    return (
      <div className={cn(baseClasses, className)}>
        No reviews yet. Be the first to share your experience.
      </div>
    );
  }

  const normalizedAvg = Math.max(0, Math.min(5, avg));

  if (size === "sm") {
    // Compact pill - good for hero or inline near seller handle
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text)] shadow-sm backdrop-blur",
          className,
        )}
      >
        <ReviewStars rating={normalizedAvg} size="sm" />
        <span className="font-semibold">
          {normalizedAvg.toFixed(1).replace(/\.0$/, "")}
        </span>
        <span className="text-[0.7rem] text-[var(--text-muted)]">
          ({total.toLocaleString()} review{total === 1 ? "" : "s"})
        </span>
      </div>
    );
  }

  // Full card with per-star breakdown
  const maxBucket = Math.max(
    1,
    ...[1, 2, 3, 4, 5].map((s) => Number(dist[s] || 0)),
  );

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 sm:p-4 text-[var(--text)] shadow-sm",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Overall rating
          </p>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text)]">
              {normalizedAvg.toFixed(1).replace(/\.0$/, "")}
            </span>
            <ReviewStars rating={normalizedAvg} size="lg" />
          </div>
          <p className="mt-1 text-xs sm:text-sm text-[var(--text-muted)]">
            Based on {total.toLocaleString()} review{total === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex-1 space-y-1.5">
          {[5, 4, 3, 2, 1].map((star) => {
            const c = Number(dist[star] || 0);
            const ratio = maxBucket ? c / maxBucket : 0;
            const width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;

            return (
              <div
                key={star}
                className="flex items-center gap-2 text-[11px] sm:text-xs text-[var(--text-muted)]"
              >
                <span className="w-6 text-right">{star}★</span>
                <div className="relative h-2 flex-1 rounded-full bg-[var(--bg-subtle)]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-[var(--border)]"
                    style={{ width }}
                  />
                </div>
                <span className="w-10 text-right">{c}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
