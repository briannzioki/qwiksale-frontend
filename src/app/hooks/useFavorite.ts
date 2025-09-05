"use client";

import { useCallback, useRef, useState } from "react";

type Options = {
  /** Initial favorite state for faster first render (optional). */
  initial?: boolean;
  /** Initial count shown next to the heart (optional). */
  initialCount?: number;
  /** Called after a successful toggle/add/remove. */
  onChange?: (isFavorited: boolean, count: number) => void;
};

export function useFavorite(productId: string, opts: Options = {}) {
  const { initial = false, initialCount = 0, onChange } = opts;

  const [isFavorited, setIsFavorited] = useState<boolean>(initial);
  const [count, setCount] = useState<number>(initialCount);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const inFlight = useRef<AbortController | null>(null);

  const add = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);

    // optimistic
    const prev = { isFavorited, count };
    if (!isFavorited) {
      setIsFavorited(true);
      setCount((c) => c + 1);
    }

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
        cache: "no-store",
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Failed to favorite (${res.status})`);
      }
      onChange?.(true, prev.isFavorited ? prev.count : prev.count + 1);
    } catch (e: any) {
      // rollback
      setIsFavorited(prev.isFavorited);
      setCount(prev.count);
      setError(e?.message || "Failed to favorite");
      throw e;
    } finally {
      setLoading(false);
    }
  }, [productId, isFavorited, onChange]);

  const remove = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);

    // optimistic
    const prev = { isFavorited, count };
    if (isFavorited) {
      setIsFavorited(false);
      setCount((c) => Math.max(0, c - 1));
    }

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    try {
      const res = await fetch("/api/favorites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
        cache: "no-store",
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Failed to unfavorite (${res.status})`);
      }
      onChange?.(false, prev.isFavorited ? Math.max(0, prev.count - 1) : prev.count);
    } catch (e: any) {
      // rollback
      setIsFavorited(prev.isFavorited);
      setCount(prev.count);
      setError(e?.message || "Failed to unfavorite");
      throw e;
    } finally {
      setLoading(false);
    }
  }, [productId, isFavorited, onChange]);

  const toggle = useCallback(async () => {
    if (isFavorited) {
      return remove();
    } else {
      return add();
    }
  }, [isFavorited, add, remove]);

  return {
    // state
    isFavorited,
    count,
    loading,
    error,
    // actions
    add,
    remove,
    toggle,
    // utilities
    setIsFavorited, // expose in case you rehydrate from server
    setCount,
  };
}
