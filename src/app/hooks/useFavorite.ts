// src/app/hooks/useFavorite.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Options = {
  /** Initial favorite state for faster first render (optional). */
  initial?: boolean;
  /** Initial count shown next to the heart (optional). */
  initialCount?: number;
  /** Called after a successful toggle/add/remove. */
  onChange?: (isFavorited: boolean, count: number) => void;
  /** If true, redirect to /signin on 401 with ?callbackUrl=<current>. */
  requireAuth?: boolean;
  /** Custom unauthorized handler (takes precedence over requireAuth). */
  onUnauthorized?: () => void;
  /** API base path (default: "/api"). */
  basePath?: string;
  /** Optional toast shim (e.g., react-hot-toast). */
  toast?: { success(msg: string): void; error(msg: string): void };
};

export function useFavorite(productId: string, opts: Options = {}) {
  const {
    initial = false,
    initialCount = 0,
    onChange,
    requireAuth = true,
    onUnauthorized,
    basePath = "/api",
    toast,
  } = opts;

  const [isFavorited, setIsFavorited] = useState<boolean>(initial);
  const [count, setCount] = useState<number>(initialCount);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      inFlight.current?.abort();
    };
  }, []);

  const origin = useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
    []
  );

  const signInRedirect = useCallback(() => {
    if (onUnauthorized) return onUnauthorized();
    if (!requireAuth) return;
    try {
      const path = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
      const cb = encodeURIComponent(path || "/");
      window.location.href = `/signin?callbackUrl=${cb}`;
    } catch {
      // no-op
    }
  }, [onUnauthorized, requireAuth]);

  async function requestOnce(
    method: "POST" | "DELETE",
    body: Record<string, unknown>,
    retry = true
  ): Promise<{ ok: boolean; status: number; json: any }> {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    const url = `${basePath}/favorites`;

    const doFetch = async () => {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, json };
    };

    try {
      return await doFetch();
    } catch (err) {
      // One quick retry on network hiccup
      if (retry && (err as any)?.name !== "AbortError") {
        try {
          return await doFetch();
        } catch {}
      }
      throw err;
    }
  }

  const add = useCallback(async () => {
    if (!productId || loading) return;
    setLoading(true);
    setError(null);

    // optimistic
    const prevFav = isFavorited;
    const prevCount = count;
    if (!prevFav) {
      setIsFavorited(true);
      setCount((c) => c + 1);
    }

    try {
      const { ok, status, json } = await requestOnce("POST", { productId });
      if (status === 401) {
        // rollback + route to sign-in
        setIsFavorited(prevFav);
        setCount(prevCount);
        signInRedirect();
        throw new Error("Unauthorized");
      }
      if (!ok || !json?.ok) {
        throw new Error(json?.error || `Failed to favorite (${status})`);
      }
      onChange?.(true, prevFav ? prevCount : prevCount + 1);
      toast?.success?.("Saved to favorites");
    } catch (e: any) {
      // rollback
      if (mounted.current) {
        setIsFavorited(prevFav);
        setCount(prevCount);
        setError(e?.message || "Failed to favorite");
        toast?.error?.("Failed to favorite");
      }
      throw e;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [productId, loading, isFavorited, count, onChange, toast, signInRedirect]);

  const remove = useCallback(async () => {
    if (!productId || loading) return;
    setLoading(true);
    setError(null);

    // optimistic
    const prevFav = isFavorited;
    const prevCount = count;
    if (prevFav) {
      setIsFavorited(false);
      setCount((c) => Math.max(0, c - 1));
    }

    try {
      const { ok, status, json } = await requestOnce("DELETE", { productId });
      if (status === 401) {
        // rollback + route to sign-in
        setIsFavorited(prevFav);
        setCount(prevCount);
        signInRedirect();
        throw new Error("Unauthorized");
      }
      if (!ok || !json?.ok) {
        throw new Error(json?.error || `Failed to unfavorite (${status})`);
      }
      onChange?.(false, prevFav ? Math.max(0, prevCount - 1) : prevCount);
      toast?.success?.("Removed from favorites");
    } catch (e: any) {
      // rollback
      if (mounted.current) {
        setIsFavorited(prevFav);
        setCount(prevCount);
        setError(e?.message || "Failed to unfavorite");
        toast?.error?.("Failed to unfavorite");
      }
      throw e;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [productId, loading, isFavorited, count, onChange, toast, signInRedirect]);

  const toggle = useCallback(async () => {
    return isFavorited ? remove() : add();
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
    setIsFavorited,
    setCount,
  };
}
