"use client";

import React from "react";
import UserAvatar from "@/app/components/UserAvatar";
import ReviewStars from "@/app/components/ReviewStars";
import { Icon } from "@/app/components/Icon";

function cn(...xs: Array<string | null | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export type ReviewItemProps = {
  review: any;
  /** Show avatar + author info. */
  showAvatar?: boolean;
  /** Additional wrapper classes. */
  className?: string;
  /** Optional edit handler (e.g. open modal). */
  onEditAction?: ((review: any) => void) | undefined;
  /** Optional delete handler (e.g. call API + refresh). */
  onDeleteAction?: ((review: any) => void) | undefined;
};

function formatDate(input: unknown): string {
  if (!input) return "";
  try {
    const d = input instanceof Date ? input : new Date(String(input as string));
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function ReviewItem({
  review,
  showAvatar = true,
  className,
  onEditAction,
  onDeleteAction,
}: ReviewItemProps) {
  const rating =
    typeof review?.rating === "number" ? (review.rating as number) : 0;

  const title: string | null =
    (review?.title as string | null) ??
    (review?.headline as string | null) ??
    null;

  const text: string =
    (review?.text as string | null) ??
    (review?.comment as string | null) ??
    "";

  const createdAtLabel = formatDate(review?.createdAt);

  const authorName: string =
    (review?.authorName as string | null) ??
    (review?.userName as string | null) ??
    (review?.author?.name as string | null) ??
    "Anonymous";

  const avatarUrl: string | null =
    (review?.authorAvatar as string | null) ??
    (review?.userImage as string | null) ??
    (review?.author?.image as string | null) ??
    null;

  const isOwner = Boolean(review?.isOwner);
  const verified = Boolean(review?.verified);

  const initials = authorName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  const canEdit = typeof onEditAction === "function";
  const canDelete = typeof onDeleteAction === "function";

  return (
    <article
      className={cn(
        "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 sm:p-3 text-[var(--text)] shadow-sm",
        className,
      )}
      data-review-id={review?.id ?? undefined}
    >
      <div className="flex items-start gap-2.5 sm:gap-3">
        {showAvatar && (
          <div className="mt-0.5">
            <UserAvatar
              src={avatarUrl ?? undefined}
              alt={`${authorName} avatar`}
              size={36}
              ring={verified}
              fallbackText={initials || "A"}
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-[var(--text)]">
                  {authorName}
                </span>

                {verified && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] sm:text-xs sm:px-2.5 sm:py-1.5 font-semibold leading-none text-[var(--text)]">
                    <Icon name="verified" className="h-3 w-3" aria-hidden />
                    Verified
                  </span>
                )}

                {isOwner && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-[11px] sm:text-xs sm:px-2.5 sm:py-1.5 font-semibold leading-none text-[var(--text)]">
                    Your review
                  </span>
                )}
              </div>

              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs text-[var(--text-muted)]">
                <ReviewStars rating={rating} size="sm" />
                {createdAtLabel && <span>• {createdAtLabel}</span>}
              </div>
            </div>

            {(canEdit || canDelete) && (
              <div className="flex shrink-0 items-center gap-1">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onEditAction?.(review)}
                    className={[
                      "inline-flex h-9 items-center rounded-xl border px-2.5 text-xs font-semibold shadow-sm transition",
                      "border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text-muted)]",
                      "hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]",
                      "active:scale-[.99]",
                      "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                    ].join(" ")}
                  >
                    Edit
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => onDeleteAction?.(review)}
                    className={[
                      "inline-flex h-9 items-center rounded-xl border px-2.5 text-xs font-semibold shadow-sm transition",
                      "border-[var(--border-subtle)] bg-[var(--bg)] text-[var(--text)]",
                      "hover:bg-[var(--bg-subtle)]",
                      "active:scale-[.99]",
                      "focus-visible:outline-none focus-visible:ring-2 ring-focus",
                    ].join(" ")}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>

          {title && (
            <p className="mt-1.5 sm:mt-2 text-sm font-semibold text-[var(--text)]">
              {title}
            </p>
          )}

          {text && (
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[var(--text-muted)]">
              {text}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
