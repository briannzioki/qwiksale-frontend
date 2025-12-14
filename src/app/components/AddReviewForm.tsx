// src/app/components/AddReviewForm.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import ReviewStars from "@/app/components/ReviewStars";

function cn(...xs: Array<string | null | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export type AddReviewFormProps = {
  listingId: string;
  /** Helps backend know what type of listing this is. */
  listingType?: "product" | "service" | "store" | string;
  className?: string;
  /** If provided, we’ll prefill rating/text. */
  existingReview?: any;
  /** Called with newly created/updated review payload on success. */
  onSubmittedAction?: (review: any) => void;
};

export function AddReviewForm({
  listingId,
  listingType = "product",
  className,
  existingReview,
  onSubmittedAction,
}: AddReviewFormProps) {
  const { data: session } = useSession();

  const [rating, setRating] = useState<number>(() =>
    typeof existingReview?.rating === "number"
      ? existingReview.rating
      : 5,
  );
  const [text, setText] = useState<string>(() => {
    if (!existingReview) return "";
    return (
      (existingReview.text as string | null) ??
      (existingReview.comment as string | null) ??
      ""
    );
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callbackUrl, setCallbackUrl] = useState("/");

  const isAuthed = Boolean(session?.user);
  const disabled = submitting || !isAuthed;

  // Update form when an existing review changes (e.g. after edit)
  useEffect(() => {
    if (!existingReview) return;
    if (
      typeof existingReview.rating === "number" &&
      existingReview.rating >= 1 &&
      existingReview.rating <= 5
    ) {
      setRating(existingReview.rating);
    }
    const nextText =
      (existingReview.text as string | null) ??
      (existingReview.comment as string | null) ??
      "";
    setText(nextText);
  }, [existingReview]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCallbackUrl(
        window.location.pathname + window.location.search,
      );
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (!isAuthed) {
      const msg = "Sign in to leave a review.";
      toast.error(msg);
      setError("You need an account to leave a review.");
      return;
    }

    const trimmed = text.trim();

    if (!rating || rating < 1 || rating > 5) {
      setError("Please select a rating between 1 and 5 stars.");
      return;
    }

    if (trimmed.length > 2000) {
      setError("Please keep your review under 2000 characters.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/reviews/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          listingId,
          listingType,
          rating,
          text: trimmed,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as any;

      if (res.status === 401 || res.status === 403) {
        const msg =
          data?.error ||
          "You need to be signed in to submit a review.";
        setError(msg);
        toast.error(msg);
        return;
      }

      if (!res.ok) {
        const msg =
          data?.error ||
          "Something went wrong while submitting your review.";
        setError(msg);
        toast.error(msg);
        return;
      }

      toast.success("Review added");
      setText("");
      setRating(5);

      const payload = data?.review ?? data;

      if (onSubmittedAction) {
        onSubmittedAction(payload);
      }

      // Fire global refresh event for listeners (e.g. ProductPageClient)
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("qs:reviews:refresh"),
        );
      }
    } catch (err: any) {
      const msg =
        err?.message ||
        "Could not submit your review. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={cn(
        "mt-4 space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Leave a review
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Share your experience to help others make safer decisions on
            QwikSale.
          </p>
        </div>

        <ReviewStars
          rating={rating}
          interactive
          size="lg"
          showLabel
          onChangeAction={setRating}
        />
      </div>

      <div>
        <label
          htmlFor={`review-text-${listingId}`}
          className="block text-xs font-medium text-muted-foreground"
        >
          Your review{" "}
          <span className="text-muted-foreground/70">(optional)</span>
        </label>
        <textarea
          id={`review-text-${listingId}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={2000}
          className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brandBlue/70"
          placeholder="What went well? What could be better? Be specific, but keep it respectful."
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{text.length}/2000 characters</span>
          <span>Keep reviews honest, respectful, and on-topic.</span>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </div>
      )}

      {!isAuthed && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="mb-1 font-semibold">Sign in to review</p>
          <p className="mb-2 opacity-80">
            You’ll need a QwikSale account to leave a rating and review
            this listing.
          </p>
          <Link
            href={`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground shadow-sm hover:bg-muted"
          >
            Sign in or create account
          </Link>
        </div>
      )}

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={disabled}
          className="btn-gradient-primary inline-flex items-center justify-center rounded-full px-4 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit review"}
        </button>
      </div>
    </form>
  );
}
