"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchReviews,
  type ListingType,
  type Review,
  type ReviewBreakdown,
  type ReviewListResponse,
  type ReviewSummary,
} from "@/app/lib/reviews";

function mergeUniqueReviews(
  existing: Review[],
  incoming: Review[],
): Review[] {
  if (!incoming.length && !existing.length) return existing;
  const out: Review[] = [];
  const seen = new Set<string>();

  const push = (r: Review) => {
    if (!r) return;
    const key =
      (r.id && String(r.id)) ||
      (r.createdAt && String(r.createdAt)) ||
      `${seen.size}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(r);
  };

  for (const r of existing) push(r);
  for (const r of incoming) push(r);

  return out;
}

export type UseListingReviewsOptions = {
  listingId: string | null | undefined;
  listingType?: ListingType;
  /** Defaults to 10. */
  pageSize?: number;
  /** Defaults to 1. */
  initialPage?: number;
  /** Optional server-fetched initial data to avoid refetch on first paint. */
  initialData?: ReviewListResponse | null;
  /** Auto-fetch on mount / when listing changes. Default: true. */
  auto?: boolean;
};

export type UseListingReviewsResult = {
  reviews: Review[];
  summary: ReviewSummary | null;
  average: number;
  count: number;
  breakdown: ReviewBreakdown | null;

  loading: boolean;
  error: string | null;

  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;

  /** Fetch page 1 and replace the list. */
  reload: () => Promise<void>;
  /** Fetch the next page and append to the list (if available). */
  loadMore: () => Promise<void>;

  /**
   * Call these when you know a mutation has occurred
   * (e.g. AddReviewForm onSubmitted, update/delete actions).
   * They will adjust local state and then trigger a full reload
   * to sync with backend summary + pagination.
   */
  onReviewCreated: (review: Review | any) => void;
  onReviewUpdated: (review: Review | any) => void;
  onReviewDeleted: (reviewOrId: Review | string | any) => void;
};

/**
 * Shared hook used by ProductPageClient / ServicePageClient (and store page if needed).
 * Handles:
 * - loading/error state
 * - pagination
 * - refresh after add/update/delete via invalidation
 */
export function useListingReviews(
  options: UseListingReviewsOptions,
): UseListingReviewsResult {
  const {
    listingId,
    listingType,
    pageSize: pageSizeProp,
    initialPage: initialPageProp,
    initialData,
    auto = true,
  } = options;

  const effectivePageSize = pageSizeProp ?? 10;
  const initialPage = initialPageProp ?? 1;

  const [page, setPage] = useState(initialData?.page ?? initialPage);
  const [reviews, setReviews] = useState<Review[]>(
    initialData?.items ?? [],
  );
  const [summary, setSummary] = useState<ReviewSummary | null>(
    initialData?.summary ?? null,
  );
  const [total, setTotal] = useState<number>(
    typeof initialData?.total === "number"
      ? initialData.total
      : 0,
  );
  const [totalPages, setTotalPages] = useState<number>(
    typeof initialData?.totalPages === "number"
      ? initialData.totalPages
      : 1,
  );
  const [hasMore, setHasMore] = useState<boolean>(
    initialData
      ? initialData.page < initialData.totalPages
      : false,
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const hasAutoLoadedRef = useRef(false);

  const resetStateForListing = useCallback(() => {
    setPage(initialPage);
    setReviews(initialData?.items ?? []);
    setSummary(initialData?.summary ?? null);
    setTotal(
      typeof initialData?.total === "number"
        ? initialData.total
        : 0,
    );
    setTotalPages(
      typeof initialData?.totalPages === "number"
        ? initialData.totalPages
        : 1,
    );
    setHasMore(
      initialData
        ? initialData.page < initialData.totalPages
        : false,
    );
    setError(null);
  }, [initialData, initialPage]);

  const loadPage = useCallback(
    async (targetPage: number, append: boolean) => {
      if (!listingId) {
        // No listing: just clear.
        setPage(initialPage);
        setReviews([]);
        setSummary(null);
        setTotal(0);
        setTotalPages(1);
        setHasMore(false);
        setError(null);
        return;
      }

      const controller = new AbortController();
      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = controller;

      const reqId = ++requestIdRef.current;

      setLoading(true);
      setError(null);

      try {
        // Ensure we never pass an undefined listingType into fetchReviews.
        const effectiveListingType: ListingType = (listingType ??
          "product") as ListingType;

        const data = await fetchReviews({
          listingId,
          listingType: effectiveListingType,
          page: targetPage,
          pageSize: effectivePageSize,
          signal: controller.signal,
        });

        if (reqId !== requestIdRef.current) {
          // Stale response; ignore.
          return;
        }

        setPage(data.page);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setHasMore(data.page < data.totalPages);
        setSummary(data.summary ?? null);
        setReviews((prev) =>
          append
            ? mergeUniqueReviews(prev, data.items)
            : data.items,
        );
      } catch (err: any) {
        if (controller.signal.aborted) {
          // Ignore abort errors.
          return;
        }
        if (reqId !== requestIdRef.current) {
          return;
        }
        setError(
          err?.message ||
            "Failed to load reviews. Please try again.",
        );
      } finally {
        if (reqId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [listingId, listingType, effectivePageSize, initialPage],
  );

  const reload = useCallback(async () => {
    await loadPage(1, false);
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    await loadPage(nextPage, true);
  }, [page, hasMore, loading, loadPage]);

  // Auto-load on mount / when listing changes
  useEffect(() => {
    // When listing or type changes, reset to initial and refetch (if auto)
    resetStateForListing();
    hasAutoLoadedRef.current = false;

    if (!auto) return;
    if (!listingId) return;

    hasAutoLoadedRef.current = true;
    void loadPage(initialPage, false);
  }, [
    auto,
    listingId,
    listingType,
    effectivePageSize,
    initialPage,
    resetStateForListing,
    loadPage,
  ]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const average = useMemo(() => {
    if (summary && typeof summary.average === "number") {
      return summary.average;
    }
    if (!reviews.length) return 0;
    const usable = reviews
      .map((r) => {
        const v =
          typeof r.rating === "number" ? r.rating : NaN;
        return Number.isFinite(v) ? v : NaN;
      })
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 5);
    if (!usable.length) return 0;
    return (
      usable.reduce((acc, n) => acc + n, 0) /
      usable.length
    );
  }, [summary, reviews]);

  const count = useMemo(() => {
    if (summary && typeof summary.count === "number") {
      return summary.count;
    }
    return reviews.length;
  }, [summary, reviews]);

  const breakdown: ReviewBreakdown | null = useMemo(() => {
    if (summary?.breakdown) return summary.breakdown;
    if (!reviews.length) return {};
    const dist: ReviewBreakdown = {};
    for (const r of reviews) {
      const v =
        typeof r.rating === "number" ? r.rating : NaN;
      if (!Number.isFinite(v) || v <= 0 || v > 5) continue;
      const star = Math.round(v);
      dist[star] = (dist[star] || 0) + 1;
    }
    return dist;
  }, [summary, reviews]);

  const onReviewCreated = useCallback(
    (reviewAny: Review | any) => {
      const review = reviewAny as Review;
      if (!review) return;

      setReviews((prev) =>
        mergeUniqueReviews([review], prev),
      );
      // Hard refresh so summary / pagination stay canonical.
      void reload();
    },
    [reload],
  );

  const onReviewUpdated = useCallback(
    (reviewAny: Review | any) => {
      const review = reviewAny as Review;
      const id = review?.id;
      if (!id) {
        // If we don't have an id, just reload.
        void reload();
        return;
      }

      setReviews((prev) =>
        prev.map((r) =>
          r.id === id ? ({ ...r, ...review } as Review) : r,
        ),
      );
      void reload();
    },
    [reload],
  );

  const onReviewDeleted = useCallback(
    (reviewOrId: Review | string | any) => {
      const id =
        typeof reviewOrId === "string"
          ? reviewOrId
          : (reviewOrId?.id as string | undefined);

      if (!id) {
        void reload();
        return;
      }

      setReviews((prev) =>
        prev.filter((r) => r.id !== id),
      );
      void reload();
    },
    [reload],
  );

  return {
    reviews,
    summary,
    average,
    count,
    breakdown,
    loading,
    error,
    page,
    pageSize: effectivePageSize,
    total,
    totalPages,
    hasMore,
    reload,
    loadMore,
    onReviewCreated,
    onReviewUpdated,
    onReviewDeleted,
  };
}
