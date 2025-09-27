// src/app/lib/favoritesStore.ts
"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import toast from "react-hot-toast";

/* ------------------------------------------------------------------ */
/* --------------------------- Constants ----------------------------- */
/* ------------------------------------------------------------------ */

const FAV_KEY = "qs_favs_v1"; // localStorage for anonymous users
const FETCH_TIMEOUT_MS = 12_000;

type ApiGetResponse =
  | { items: string[]; nextCursor?: string | null }
  | {
      items: Array<
        | { productId: string; createdAt?: string | Date }
        | { product: { id: string } }
        | { userId: string; productId: string; createdAt?: string | Date }
      >;
      nextCursor?: string | null;
    }
  | { error: string };

type ApiOk = { ok: true };
type ApiErr = { error: string };
type ApiToggleBody =
  | { productId: string; action?: "add" | "remove" }
  | { productId: string };

type LoadState = "idle" | "loading" | "ready" | "error";

/* ------------------------------------------------------------------ */
/* --------------------------- Utilities ----------------------------- */
/* ------------------------------------------------------------------ */

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function extractIdsFromApi(res: ApiGetResponse | null | undefined): string[] {
  if (!res || typeof res !== "object" || !("items" in res)) return [];
  const items: any[] = Array.isArray((res as any).items) ? (res as any).items : [];
  if (items.length && typeof items[0] === "string") return uniq(items as string[]);

  const ids = new Set<string>();
  for (const it of items) {
    if (!it) continue;
    if (typeof (it as any).productId === "string") {
      ids.add((it as any).productId);
      continue;
    }
    const pid = (it as any)?.product?.id;
    if (typeof pid === "string") ids.add(pid);
  }
  return [...ids];
}

function loadLocal(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function saveLocal(ids: string[]) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(uniq(ids.map(String))));
  } catch {
    /* ignore quota */
  }
}

/** fetch with abort + timeout + JSON parsing (exactOptionalPropertyTypes-safe) */
async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<{ res: Response; json: T | null }> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(input, {
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/json", ...(init.headers || {}) },
      ...init,
      // keep the property defined and never undefined
      signal: (init as any).signal ?? ac.signal ?? null,
    } as RequestInit);
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { res, json };
  } finally {
    clearTimeout(t);
  }
}

/** naive backoff: 1s, 2s, 4s, capped */
async function backoff(attempt: number, capMs = 8000) {
  const ms = Math.min(1000 * Math.pow(2, Math.max(0, attempt)), capMs);
  await new Promise((r) => setTimeout(r, ms));
}

/* ------------------------------------------------------------------ */
/* ----------------------------- Hook -------------------------------- */
/* ------------------------------------------------------------------ */

type Options = {
  onChangeAction?: (ids: string[]) => void;
};

export function useFavourites(opts: Options = {}) {
  const { onChangeAction } = opts;

  const [ids, setIds] = useState<string[]>([]);
  const [authed, setAuthed] = useState(false);
  const authedRef = useRef(authed); // <- live flag for storage listener
  const [state, setState] = useState<LoadState>("idle");

  const mountedRef = useRef(true);
  const inFlightRef = useRef<AbortController | null>(null);
  const optimisticPrevRef = useRef<string[] | null>(null);

  // keep refs in sync
  const idsRef = useRef<string[]>([]);
  useEffect(() => {
    idsRef.current = ids;
    authedRef.current = authed;
    onChangeAction?.(ids);
  }, [ids, authed, onChangeAction]);

  /** initial load: try server; on 401 fall back to local. also merge local → server on first signin */
  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      setState("loading");
      try {
        const { res, json } = await fetchJson<ApiGetResponse>("/api/favorites");
        if (res.ok) {
          setAuthed(true);
          const serverIds = extractIdsFromApi(json);
          // merge local anon -> server
          const localIds = loadLocal();
          const toAdd = localIds.filter((id) => !serverIds.includes(id));

          // push anon favs up (best-effort)
          for (const pid of toAdd) {
            try {
              await fetch("/api/favorites", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ productId: pid } as ApiToggleBody),
              });
            } catch {
              /* ignore */
            }
          }

          // Clear anon store to avoid dup/flip-flop
          saveLocal([]);

          if (mountedRef.current) {
            setIds(uniq([...serverIds, ...localIds]));
            setState("ready");
          }
        } else if (res.status === 401) {
          // anonymous mode
          const localIds = loadLocal();
          if (mountedRef.current) {
            setAuthed(false);
            setIds(localIds);
            setState("ready");
          }
        } else {
          // server error → local only
          if (mountedRef.current) {
            setAuthed(false);
            setIds(loadLocal());
            setState("error");
          }
        }
      } catch {
        // network error → local only
        if (mountedRef.current) {
          setAuthed(false);
          setIds(loadLocal());
          setState("error");
        }
      }
    })();

    // cross-tab sync (anon only; use live ref)
    const onStorage = (e: StorageEvent) => {
      if (!mountedRef.current) return;
      if (e.key === FAV_KEY && !authedRef.current) {
        try {
          const arr = e.newValue ? JSON.parse(e.newValue) : [];
          if (Array.isArray(arr)) setIds(arr.map(String));
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("storage", onStorage);
      inFlightRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** fresh pull from server (no-op for anon) */
  const refresh = useCallback(async () => {
    if (!authed) return;
    const { res, json } = await fetchJson<ApiGetResponse>("/api/favorites");
    if (!res.ok) return;
    const serverIds = extractIdsFromApi(json);
    if (mountedRef.current) setIds(serverIds);
  }, [authed]);

  const idsSet = useMemo(() => new Set(ids.map(String)), [ids]);
  const isFavourite = useCallback((id: string | number) => idsSet.has(String(id)), [idsSet]);

  /** internal api call with tiny retry/backoff — USE PROPER VERBS */
  const callToggle = useCallback(
    async (productId: string, nowFav: boolean) => {
      inFlightRef.current?.abort();
      const ac = new AbortController();
      inFlightRef.current = ac;

      const method = nowFav ? "POST" : "DELETE";
      const body: ApiToggleBody = { productId };

      let attempt = 0;
      while (attempt < 3) {
        try {
          const { res, json } = await fetchJson<ApiOk | ApiErr>(
            "/api/favorites",
            {
              method,
              headers: { "content-type": "application/json" },
              credentials: "include",
              body: JSON.stringify(body),
              signal: ac.signal,
            },
            FETCH_TIMEOUT_MS
          );
          if (res.ok) return true;
          const msg = (json as ApiErr)?.error || `HTTP ${res.status}`;
          throw new Error(msg);
        } catch (e: any) {
          attempt++;
          if (e?.name === "AbortError" || attempt >= 3) {
            throw e;
          }
          await backoff(attempt);
        }
      }
    },
    []
  );

  /** add (optimistic) */
  const add = useCallback(
    async (id: string | number) => {
      const s = String(id);
      if (idsSet.has(s)) return true; // already in

      const next = uniq([...idsRef.current, s]);
      optimisticPrevRef.current = idsRef.current;
      setIds(next);

      if (!authed) {
        saveLocal(next);
        return true;
      }

      try {
        await callToggle(s, true);
        return true;
      } catch (e: any) {
        const prev = optimisticPrevRef.current ?? idsRef.current;
        if (mountedRef.current) setIds(prev);
        toast.error(e?.message || "Couldn’t add to favorites");
        return false;
      } finally {
        optimisticPrevRef.current = null;
      }
    },
    [authed, callToggle, idsSet]
  );

  /** remove (optimistic) */
  const remove = useCallback(
    async (id: string | number) => {
      const s = String(id);
      if (!idsSet.has(s)) return true; // already out

      const next = idsRef.current.filter((x) => x !== s);
      optimisticPrevRef.current = idsRef.current;
      setIds(next);

      if (!authed) {
        saveLocal(next);
        return true;
      }

      try {
        await callToggle(s, false);
        return true;
      } catch (e: any) {
        const prev = optimisticPrevRef.current ?? idsRef.current;
        if (mountedRef.current) setIds(prev);
        toast.error(e?.message || "Couldn’t remove from favorites");
        return false;
      } finally {
        optimisticPrevRef.current = null;
      }
    },
    [authed, callToggle, idsSet]
  );

  /** toggle (optimistic) */
  const toggle = useCallback(
    async (id: string | number) => {
      return isFavourite(id) ? remove(id) : add(id);
    },
    [isFavourite, add, remove]
  );

  const loading = state === "loading" || state === "idle";
  const count = ids.length;

  return {
    // state
    ids,
    idsSet,
    count,
    authed,
    loading,

    // queries
    isFavourite,

    // actions
    add,
    remove,
    toggle,
    refresh,
  };
}
