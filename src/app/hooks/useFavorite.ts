"use client";
// src/app/hooks/useFavorite.ts

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Entity = "product" | "service";

type Options = {
  initial?: boolean;
  initialCount?: number;
  onChange?: (isFavorited: boolean, count: number) => void;
  requireAuth?: boolean;
  onUnauthorized?: () => void;
  basePath?: string;
  toast?: { success(msg: string): void; error(msg: string): void };
  entity?: Entity;
};

export function useFavorite(id: string, opts: Options = {}) {
  const {
    initial = false,
    initialCount = 0,
    onChange,
    requireAuth = true,
    onUnauthorized,
    basePath = "/api",
    toast,
    entity = "product",
  } = opts;

  const [isFavorited, setIsFavorited] = useState<boolean>(initial);
  const [count, setCount] = useState<number>(initialCount);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  const inFlight = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const stateRef = useRef({ isFavorited: initial, count: initialCount });
  stateRef.current.isFavorited = isFavorited;
  stateRef.current.count = count;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      inFlight.current?.abort();
    };
  }, []);

  const signInRedirect = useCallback(() => {
    if (onUnauthorized) return onUnauthorized();
    if (!requireAuth) return;
    try {
      if (typeof window !== "undefined") {
        if (window.location.pathname === "/signin") return;
        const path = window.location.pathname + window.location.search + window.location.hash;
        const cb = encodeURIComponent(path || "/");
        window.location.href = `/signin?callbackUrl=${cb}`;
      }
    } catch {
      /* no-op */
    }
  }, [onUnauthorized, requireAuth]);

  const buildBody = useCallback(() => {
    const body: Record<string, unknown> = { entity, id };
    if (entity === "product") body["productId"] = id;
    if (entity === "service") body["serviceId"] = id;
    return body;
  }, [entity, id]);

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
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
      });
      let json: any = null;
      try {
        const text = await res.text();
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }
      return { ok: res.ok, status: res.status, json };
    };

    try {
      return await doFetch();
    } catch (err: any) {
      if (retry && err?.name !== "AbortError") {
        try {
          return await doFetch();
        } catch {}
      }
      throw err;
    }
  }

  const add = useCallback(async () => {
    if (!id || loading || busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);

    const prevFav = stateRef.current.isFavorited;
    const prevCount = stateRef.current.count;
    if (!prevFav) {
      setIsFavorited(true);
      setCount((c) => c + 1);
    }

    try {
      const { ok, status, json } = await requestOnce("POST", buildBody());
      if (status === 401) {
        if (mounted.current) {
          setIsFavorited(prevFav);
          setCount(prevCount);
        }
        signInRedirect();
        throw new Error("Unauthorized");
      }
      if (!ok || (json && json.ok === false)) {
        throw new Error(json?.error || `Failed to favorite (${status})`);
      }
      if (mounted.current) {
        if (typeof json?.count === "number") setCount(Math.max(0, json.count));
        if (typeof json?.favorited === "boolean") setIsFavorited(json.favorited);
      }
      onChange?.(
        true,
        typeof json?.count === "number" ? json.count : prevFav ? prevCount : prevCount + 1
      );
      toast?.success?.("Saved to favorites");
    } catch (e: any) {
      if (mounted.current) {
        setIsFavorited(prevFav);
        setCount(prevCount);
        setError(e?.message || "Failed to favorite");
        toast?.error?.("Failed to favorite");
      }
    } finally {
      if (mounted.current) setLoading(false);
      busy.current = false;
    }
  }, [id, loading, onChange, toast, signInRedirect, buildBody]);

  const remove = useCallback(async () => {
    if (!id || loading || busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);

    const prevFav = stateRef.current.isFavorited;
    const prevCount = stateRef.current.count;
    if (prevFav) {
      setIsFavorited(false);
      setCount((c) => Math.max(0, c - 1));
    }

    try {
      const { ok, status, json } = await requestOnce("DELETE", buildBody());
      if (status === 401) {
        if (mounted.current) {
          setIsFavorited(prevFav);
          setCount(prevCount);
        }
        signInRedirect();
        throw new Error("Unauthorized");
      }
      if (!ok || (json && json.ok === false)) {
        throw new Error(json?.error || `Failed to unfavorite (${status})`);
      }
      if (mounted.current) {
        if (typeof json?.count === "number") setCount(Math.max(0, json.count));
        if (typeof json?.favorited === "boolean") setIsFavorited(json.favorited);
      }
      onChange?.(
        false,
        typeof json?.count === "number"
          ? json.count
          : prevFav
          ? Math.max(0, prevCount - 1)
          : prevCount
      );
      toast?.success?.("Removed from favorites");
    } catch (e: any) {
      if (mounted.current) {
        setIsFavorited(prevFav);
        setCount(prevCount);
        setError(e?.message || "Failed to unfavorite");
        toast?.error?.("Failed to unfavorite");
      }
    } finally {
      if (mounted.current) setLoading(false);
      busy.current = false;
    }
  }, [id, loading, onChange, toast, signInRedirect, buildBody]);

  const toggle = useCallback(async () => {
    return stateRef.current.isFavorited ? remove() : add();
  }, [add, remove]);

  return {
    isFavorited,
    count,
    loading,
    error,
    add,
    remove,
    toggle,
    setIsFavorited,
    setCount,
  };
}
