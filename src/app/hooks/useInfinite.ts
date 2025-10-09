// src/app/hooks/useInfinite.ts
"use client";

import { useEffect, useRef, useState } from "react";

type UseInfiniteOpts<T> = {
  /** Cache/reset key: when this changes, the hook resets and refetches */
  key: string;
  /** Fetches a page (1-based). Must return an array (empty if no items). */
  fetchPageAction: (page: number) => Promise<T[]>;
  /** First page index. Default: 1 */
  initialPage?: number;
  /** Total number of pages available (1-based). */
  totalPages: number;
  /** Optional: error callback (named with Action to satisfy Next’s rule) */
  onErrorAction?: (err: unknown) => void;
};

export function useInfinite<T>({
  key,
  fetchPageAction,
  initialPage = 1,
  totalPages,
  onErrorAction,
}: UseInfiniteOpts<T>) {
  const [page, setPage] = useState(initialPage);
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  // Guards to avoid races / setState after unmount
  const doneRef = useRef<boolean>(initialPage >= totalPages);
  const mountedRef = useRef<boolean>(false);
  const runIdRef = useRef<number>(0); // increments on reset to cancel stale runs

  // Reset when key/initialPage/totalPages change
  useEffect(() => {
    runIdRef.current += 1; // invalidate any in-flight work
    setItems([]);
    setPage(initialPage);
    doneRef.current = initialPage >= totalPages;
  }, [key, initialPage, totalPages]);

  // Track mount state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch whenever `page` advances
  useEffect(() => {
    let cancelled = false;
    const thisRun = runIdRef.current;

    (async () => {
      if (doneRef.current || loading) return;
      try {
        setLoading(true);
        const next = await fetchPageAction(page);

        // Abort updates if we got reset/unmounted in the meantime
        if (cancelled || !mountedRef.current || thisRun !== runIdRef.current) return;

        setItems((prev) => (page === initialPage ? next : [...prev, ...next]));
      } catch (err) {
        if (!cancelled && mountedRef.current && thisRun === runIdRef.current) {
          onErrorAction?.(err);
        }
      } finally {
        if (!cancelled && mountedRef.current && thisRun === runIdRef.current) {
          setLoading(false);
          if (page >= totalPages) {
            doneRef.current = true;
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page, totalPages, initialPage, fetchPageAction, loading, onErrorAction]);

  const loadMore = () => {
    if (!doneRef.current && !loading) {
      setPage((p) => p + 1);
    }
  };

  return {
    items,
    page,
    loading,
    loadMore,
    hasMore: !doneRef.current,
  };
}
