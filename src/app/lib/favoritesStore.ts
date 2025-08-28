// src/app/lib/favoritesStore.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";

const FAV_KEY = "qs_favs_v1";           // localStorage store for anonymous users
const FETCH_TIMEOUT_MS = 12_000;

type ApiGetResponse =
  | { items: string[] } // already normalized by backend
  | {
      items: Array<
        | { productId: string } // minimal
        | { product: { id: string } } // when include: { product: true }
        | { userId: string; productId: string; createdAt?: string | Date } // Prisma Favorite
      >;
    }
  | { error: string };

// POST /api/favorites body
type ApiToggleBody =
  | { productId: string; action?: "add" | "remove" } // preferred
  | { productId: string }; // legacy (paired with method DELETE for removal)

/** Extracts product IDs from the various shapes our API might return */
function extractIdsFromApi(res: ApiGetResponse | null | undefined): string[] {
  if (!res || typeof res !== "object" || !("items" in res)) return [];
  const items = (res as any).items;
  if (!Array.isArray(items)) return [];

  // If it's already an array of strings (ids)
  if (items.length > 0 && typeof items[0] === "string") {
    return [...new Set(items as string[])];
  }

  // Otherwise, map known shapes to productId
  const ids = new Set<string>();
  for (const it of items) {
    if (!it) continue;
    if (typeof it.productId === "string") {
      ids.add(it.productId);
      continue;
    }
    const pid = it?.product?.id;
    if (typeof pid === "string") {
      ids.add(pid);
      continue;
    }
  }
  return [...ids];
}

function loadLocal(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) return parsed.map(String);
    return [];
  } catch {
    return [];
  }
}

function saveLocal(ids: string[]) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota errors
  }
}

/** Small helper to fetch with timeout/abort */
async function fetchJson(input: RequestInfo, init?: RequestInit, timeoutMs = FETCH_TIMEOUT_MS) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(input, { cache: "no-store", ...init, signal: ac.signal });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      // ignore non-JSON
    }
    return { res, json };
  } finally {
    clearTimeout(id);
  }
}

export function useFavourites() {
  const [ids, setIds] = useState<string[]>([]);
  const [authed, setAuthed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const mountedRef = useRef(true);

  // Keep a stable reference to current ids so we can rollback on error
  const idsRef = useRef<string[]>([]);
  useEffect(() => {
    idsRef.current = ids;
  }, [ids]);

  // Initial load: try server first; if unauthorized/offline, fall back to local.
  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      try {
        setLoading(true);

        const { res, json } = await fetchJson("/api/favorites");
        if (res.ok) {
          const serverIds = extractIdsFromApi(json);
          setAuthed(true);

          // Merge any local anonymous favorites into the server on first sign-in
          const localIds = loadLocal();
          const toAdd = localIds.filter((id) => !serverIds.includes(id));

          if (toAdd.length > 0) {
            // Best-effort batch upsert (sequential to keep API simple)
            for (const pid of toAdd) {
              await fetch("/api/favorites", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ productId: pid, action: "add" } satisfies ApiToggleBody),
              }).catch(() => {});
            }
          }

          const merged = [...new Set([...serverIds, ...localIds])];
          saveLocal([]); // clear local after merge (avoid dupes)
          if (mountedRef.current) setIds(merged);
        } else {
          // Not signed in or server error → fall back to local
          const localIds = loadLocal();
          if (mountedRef.current) {
            setAuthed(false);
            setIds(localIds);
          }
        }
      } catch {
        // Network failure → local
        if (mountedRef.current) {
          setAuthed(false);
          setIds(loadLocal());
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();

    // Sync across tabs (only relevant for anonymous/local mode)
    const onStorage = (e: StorageEvent) => {
      if (e.key === FAV_KEY && !authed) {
        try {
          const arr = e.newValue ? JSON.parse(e.newValue) : [];
          if (Array.isArray(arr)) setIds(arr.map(String));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Force refresh from server (no-op for anonymous users) */
  const refresh = async () => {
    if (!authed) return;
    const { res, json } = await fetchJson("/api/favorites");
    if (!res.ok) return;
    const serverIds = extractIdsFromApi(json);
    if (mountedRef.current) setIds(serverIds);
  };

  const idsSet = useMemo(() => new Set(ids.map(String)), [ids]);

  const isFavourite = (id: string | number) => idsSet.has(String(id));

  /**
   * Optimistic toggle with rollback.
   * - If authenticated: uses POST + action ("add"/"remove").
   * - If unauthenticated: updates localStorage only.
   */
  const toggle = async (id: string | number) => {
    const s = String(id);
    const wasFav = idsSet.has(s);
    const nowFav = !wasFav;
    const next = nowFav ? [...ids, s] : ids.filter((x) => x !== s);

    setIds(next);
    if (!authed) {
      saveLocal(next);
      return nowFav;
    }

    // Authenticated path: call API (prefer POST with action)
    try {
      const { res, json } = await fetchJson("/api/favorites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: s,
          action: nowFav ? "add" : "remove",
        } as ApiToggleBody),
      });

      if (!res.ok) {
        throw new Error((json && json.error) || `Failed (${res.status})`);
      }
      // success → keep optimistic state
      return nowFav;
    } catch (e: any) {
      // Rollback on error
      const prev = idsRef.current;
      setIds(prev);
      toast.error(e?.message || "Couldn’t update favorites");
      return wasFav;
    }
  };

  const count = ids.length;

  return {
    ids,
    idsSet,
    count,
    authed,
    loading,
    isFavourite,
    toggle,
    refresh,
  };
}

