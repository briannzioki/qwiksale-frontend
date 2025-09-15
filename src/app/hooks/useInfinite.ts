"use client";
import { useEffect, useRef, useState } from "react";

export function useInfinite<T>({
  key,
  fetchPage,
  initialPage = 1,
  totalPages,
}: {
  key: string;
  fetchPage: (page: number) => Promise<T[]>;
  initialPage: number;
  totalPages: number;
}) {
  const [page, setPage] = useState(initialPage);
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const doneRef = useRef(page >= totalPages);

  useEffect(() => {
    setItems([]); setPage(initialPage); doneRef.current = initialPage >= totalPages;
  }, [key, initialPage, totalPages]);

  useEffect(() => {
    (async () => {
      if (doneRef.current || loading) return;
      setLoading(true);
      const next = await fetchPage(page);
      setItems((prev) => (page === initialPage ? next : [...prev, ...next]));
      setLoading(false);
      if (page >= totalPages) doneRef.current = true;
    })();
  }, [page, totalPages, initialPage, fetchPage, loading]);

  const loadMore = () => {
    if (!doneRef.current && !loading) setPage((p) => p + 1);
  };

  return { items, page, loading, loadMore, hasMore: !doneRef.current };
}
