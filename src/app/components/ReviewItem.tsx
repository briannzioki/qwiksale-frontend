// src/app/components/ReviewItem.tsx
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
    const d =
      input instanceof Date ? input : new Date(String(input as string));
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
        "rounded-xl border border-border bg-card p-3 shadow-sm",
        className,
      )}
      data-review-id={review?.id ?? undefined}
    >
      <div className="flex items-start gap-3">
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
                <span className="truncate text-sm font-semibold text-foreground">
                  {authorName}
                </span>

                {verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <Icon
                      name="verified"
                      className="h-3 w-3"
                      aria-hidden
                    />
                    Verified
                  </span>
                )}

                {isOwner && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brandBlue/10 px-2 py-0.5 text-[10px] font-semibold text-brandBlue">
                    Your review
                  </span>
                )}
              </div>

              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
                    className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted"
                  >
                    Edit
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => onDeleteAction?.(review)}
                    className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>

          {title && (
            <p className="mt-2 text-sm font-medium text-foreground">
              {title}
            </p>
          )}

          {text && (
            <p className="mt-1 whitespace-pre-line text-sm text-foreground">
              {text}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
