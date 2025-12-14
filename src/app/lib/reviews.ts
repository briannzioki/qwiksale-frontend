// src/app/lib/reviews.ts

/**
 * Shared review types + thin API wrappers.
 *
 * Endpoints assumed:
 * - GET  /api/reviews/list?listingId=...&listingType=...&page=...&pageSize=...
 * - POST /api/reviews/add
 * - POST /api/reviews/update
 * - POST /api/reviews/delete
 *
 * All requests use `cache: "no-store"` and `credentials: "include"`
 * so the backend can mark the current viewer as owner, etc.
 */

export type ListingType = "product" | "service" | "store" | string;

export type ReviewBreakdown = Partial<Record<number, number>>;

export type ReviewSummary = {
  average: number;
  count: number;
  breakdown?: ReviewBreakdown;
};

export type Review = {
  id?: string;
  listingId?: string;
  listingType?: ListingType | null;
  rating?: number | null;
  title?: string | null;
  headline?: string | null;
  text?: string | null;
  comment?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;

  authorId?: string | null;
  authorName?: string | null;
  authorAvatar?: string | null;

  userId?: string | null;
  userName?: string | null;
  userImage?: string | null;

  author?: {
    id?: string;
    name?: string | null;
    image?: string | null;
  } | null;

  isOwner?: boolean;
  verified?: boolean;

  // Allow backend to add extra fields without blowing up TS
  [key: string]: any;
};

export type ReviewListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: Review[];
  summary: ReviewSummary;
};

/* -------------------------------------------------------------------------- */
/* utils                                                                      */
/* -------------------------------------------------------------------------- */

function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function computeSummaryFromItems(
  items: Review[],
  fallbackCount?: number,
  fallbackAverage?: number,
  fallbackBreakdown?: ReviewBreakdown,
): ReviewSummary {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      average: fallbackAverage ?? 0,
      count: fallbackCount ?? 0,
      breakdown: fallbackBreakdown ?? {},
    };
  }

  const usable = items
    .map((r) => safeNumber((r as any).rating, NaN))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 5);

  if (!usable.length) {
    return {
      average: fallbackAverage ?? 0,
      count: fallbackCount ?? 0,
      breakdown: fallbackBreakdown ?? {},
    };
  }

  const total = usable.reduce((a, b) => a + b, 0);
  const avg = total / usable.length;

  const breakdown: ReviewBreakdown = usable.reduce(
    (acc, n) => {
      const star = Math.round(n);
      acc[star] = (acc[star] || 0) + 1;
      return acc;
    },
    {} as ReviewBreakdown,
  );

  return {
    average: avg,
    count: usable.length,
    breakdown,
  };
}

function makeEmptyReviewList(
  page = 1,
  pageSize = 0,
): ReviewListResponse {
  return {
    page,
    pageSize,
    total: 0,
    totalPages: 1,
    items: [],
    summary: {
      average: 0,
      count: 0,
      breakdown: {},
    },
  };
}

async function requestJson<T>(
  input: string,
  init: RequestInit,
): Promise<T> {
  const res = await fetch(input, {
    cache: "no-store",
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const data = (await res.json().catch(() => ({}))) as any;

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `Request failed with status ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data as T;
}

/* -------------------------------------------------------------------------- */
/* list                                                                       */
/* -------------------------------------------------------------------------- */

export type FetchReviewsOptions = {
  listingId: string;
  listingType?: ListingType;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
};

/**
 * Fetch a page of reviews for a listing.
 * Gracefully returns an empty list on 404 / no data.
 */
export async function fetchReviews(
  options: FetchReviewsOptions,
): Promise<ReviewListResponse> {
  const {
    listingId,
    listingType,
    page = 1,
    pageSize = 10,
    signal,
  } = options;

  if (!listingId) {
    return makeEmptyReviewList(page, pageSize);
  }

  const params = new URLSearchParams();
  params.set("listingId", listingId);
  if (listingType) params.set("listingType", String(listingType));
  if (page) params.set("page", String(page));
  if (pageSize) params.set("pageSize", String(pageSize));

  const url = `/api/reviews/list?${params.toString()}`;

  let res: Response;
  try {
    const init: RequestInit = {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/json" },
    };

    if (signal) {
      // Only set signal when we actually have one; keeps TS happy with exactOptionalPropertyTypes.
      init.signal = signal;
    }

    res = await fetch(url, init);
  } catch (err: any) {
    if (err?.name === "AbortError") {
      // Let callers decide what to do with aborts
      throw err;
    }
    throw new Error(
      err?.message ||
        "Failed to fetch reviews. Please try again.",
    );
  }

  // Treat 404 / 204 as "no reviews yet"
  if (res.status === 404 || res.status === 204) {
    return makeEmptyReviewList(page, pageSize);
  }

  const data = (await res.json().catch(() => ({}))) as any;

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `Failed to fetch reviews (${res.status})`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  const rawItems =
    Array.isArray(data?.items) && data.items.length
      ? data.items
      : Array.isArray(data?.reviews)
      ? data.reviews
      : [];

  const items: Review[] = rawItems as Review[];

  const resolvedPage = safeNumber(data?.page, page) || page;
  const resolvedPageSize =
    safeNumber(data?.pageSize, pageSize) || pageSize;

  const total = safeNumber(
    data?.total,
    typeof data?.totalCount === "number"
      ? data.totalCount
      : items.length,
  );

  const totalPages =
    safeNumber(data?.totalPages, 0) ||
    Math.max(
      1,
      resolvedPageSize > 0
        ? Math.ceil(total / resolvedPageSize)
        : 1,
    );

  const rawSummary =
    data?.summary ??
    data?.reviewSummary ??
    data?.aggregate ??
    null;

  let summary: ReviewSummary;

  if (rawSummary && typeof rawSummary === "object") {
    summary = {
      average: safeNumber(
        (rawSummary as any).average,
        safeNumber((rawSummary as any).avg, 0),
      ),
      count: safeNumber(
        (rawSummary as any).count,
        safeNumber(
          (rawSummary as any).total,
          items.length,
        ),
      ),
      breakdown:
        (rawSummary as any).breakdown ??
        (rawSummary as any).dist ??
        undefined,
    };
  } else {
    summary = computeSummaryFromItems(items);
  }

  return {
    page: resolvedPage,
    pageSize: resolvedPageSize,
    total,
    totalPages,
    items,
    summary,
  };
}

/* -------------------------------------------------------------------------- */
/* mutations                                                                  */
/* -------------------------------------------------------------------------- */

export type CreateReviewInput = {
  listingId: string;
  listingType?: ListingType;
  rating: number;
  text?: string;
  title?: string;
};

export type UpdateReviewInput = {
  id: string;
  rating?: number;
  text?: string;
  title?: string;
};

export type DeleteReviewInput = {
  id: string;
};

export type ReviewMutationResult = {
  review: Review | null;
  summary?: ReviewSummary | null;
  raw: any;
};

/**
 * Create a new review.
 * Normally you’ll let `AddReviewForm` hit the API directly,
 * then call `useListingReviews().reload()` – this wrapper is
 * here if you want to drive it manually.
 */
export async function createReview(
  input: CreateReviewInput,
): Promise<ReviewMutationResult> {
  const payload = {
    listingId: input.listingId,
    listingType: input.listingType,
    rating: input.rating,
    ...(input.text ? { text: input.text } : {}),
    ...(input.title ? { title: input.title } : {}),
  };

  const data = await requestJson<any>("/api/reviews/add", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const review: Review | null =
    (data?.review as Review) ??
    ((data &&
      typeof data === "object" &&
      ("id" in data || "rating" in data)) as any
      ? (data as Review)
      : null);

  const rawSummary = data?.summary ?? null;
  const summary: ReviewSummary | null = rawSummary
    ? {
        average: safeNumber(rawSummary.average, 0),
        count: safeNumber(
          rawSummary.count,
          review ? 1 : 0,
        ),
        breakdown: rawSummary.breakdown ?? undefined,
      }
    : null;

  return { review, summary, raw: data };
}

/**
 * Update an existing review by id.
 */
export async function updateReview(
  input: UpdateReviewInput,
): Promise<ReviewMutationResult> {
  const payload: any = { id: input.id };
  if (typeof input.rating === "number")
    payload.rating = input.rating;
  if (typeof input.text === "string")
    payload.text = input.text;
  if (typeof input.title === "string")
    payload.title = input.title;

  const data = await requestJson<any>(
    "/api/reviews/update",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  const review: Review | null =
    (data?.review as Review) ??
    ((data &&
      typeof data === "object" &&
      ("id" in data || "rating" in data)) as any
      ? (data as Review)
      : null);

  const rawSummary = data?.summary ?? null;
  const summary: ReviewSummary | null = rawSummary
    ? {
        average: safeNumber(rawSummary.average, 0),
        count: safeNumber(rawSummary.count, 0),
        breakdown: rawSummary.breakdown ?? undefined,
      }
    : null;

  return { review, summary, raw: data };
}

/**
 * Delete a review by id.
 */
export async function deleteReview(
  input: DeleteReviewInput,
): Promise<ReviewMutationResult> {
  const payload = { id: input.id };

  const data = await requestJson<any>(
    "/api/reviews/delete",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  const review: Review | null =
    (data?.review as Review) ??
    ((data &&
      typeof data === "object" &&
      ("id" in data || "rating" in data)) as any
      ? (data as Review)
      : null);

  const rawSummary = data?.summary ?? null;
  const summary: ReviewSummary | null = rawSummary
    ? {
        average: safeNumber(rawSummary.average, 0),
        count: safeNumber(rawSummary.count, 0),
        breakdown: rawSummary.breakdown ?? undefined,
      }
    : null;

  return { review, summary, raw: data };
}
