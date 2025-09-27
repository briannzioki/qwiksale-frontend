// src/app/components/FavoriteButton.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useFavourites } from "../lib/favoritesStore";

type Kind = "product" | "service";

type BaseProps = {
  compact?: boolean;
  labelPrefix?: string;
  className?: string;
};

type ProductProps = BaseProps & { productId: string | number; serviceId?: never; id?: never; type?: never };
type ServiceProps = BaseProps & { serviceId: string | number; productId?: never; id?: never; type?: never };
type GenericProps = BaseProps & { id: string | number; type?: Kind; productId?: never; serviceId?: never };
type Props = ProductProps | ServiceProps | GenericProps;

/* ------------------------ tiny client analytics ------------------------ */
function trackClient(event: string, payload?: Record<string, unknown>) {
  try {
    // eslint-disable-next-line no-console
    console.log("[qs:track]", event, payload);
    if (typeof window !== "undefined" && "CustomEvent" in window) {
      window.dispatchEvent(new CustomEvent("qs:track", { detail: { event, payload } }));
    }
  } catch {}
}

export default function FavoriteButton(props: Props) {
  // Resolve id + type
  const targetId = useMemo(() => {
    if ("productId" in props && props.productId != null) return String(props.productId);
    if ("serviceId" in props && props.serviceId != null) return String(props.serviceId);
    if ("id" in props && props.id != null) return String(props.id);
    return "";
  }, [props]);

  const targetType: Kind = useMemo(() => {
    if ("serviceId" in props && props.serviceId != null) return "service";
    if ("productId" in props && props.productId != null) return "product";
    if ("type" in props && props.type) return props.type!;
    return "product";
  }, [props]);

  const {
    compact = false,
    labelPrefix = targetType === "service" ? "Service" : "Item",
    className = "",
  } = props as BaseProps;

  // Your favourites API (non-selector style)
  const store = useFavourites(); // returns an object with ids/isFavourite/toggle etc.

  const callIsFav = useCallback(
    (id: string): boolean => {
      if (typeof store?.isFavourite === "function") return !!store.isFavourite(id);
      const ids: string[] = Array.isArray((store as any)?.ids) ? (store as any).ids.map(String) : [];
      return ids.includes(id);
    },
    [store]
  );

  const callToggle = useCallback(
    async (id: string): Promise<boolean> => {
      if (typeof store?.toggle === "function") {
        try {
          const res = await store.toggle(id);
          if (typeof res === "boolean") return res;
          return callIsFav(id);
        } catch {
          return callIsFav(id);
        }
      }
      throw new Error("Favorites not available");
    },
    [store, callIsFav]
  );

  // Local state mirrors store with optimistic updates
  const [fav, setFav] = useState<boolean>(false);
  const [pending, setPending] = useState(false);
  const cooldownRef = useRef<number>(0);
  const mountedRef = useRef(false);

  // Live region with cleanup to avoid overlaps
  const [live, setLive] = useState("");
  const liveTimerRef = useRef<number | null>(null);
  const announce = useCallback((message: string) => {
    if (liveTimerRef.current) {
      clearTimeout(liveTimerRef.current);
      liveTimerRef.current = null;
    }
    setLive(message);
    liveTimerRef.current = window.setTimeout(() => {
      setLive("");
      liveTimerRef.current = null;
    }, 1200);
  }, []);

  // Initial sync + on id change
  useEffect(() => {
    setFav(callIsFav(targetId));
  }, [callIsFav, targetId]);

  // Subscribe to store changes if your store exposes a subscribe API (Zustand-like)
  useEffect(() => {
    const api = (useFavourites as unknown) as { subscribe?: (listener: () => void) => () => void };
    if (api?.subscribe) {
      const unsub = api.subscribe(() => setFav(callIsFav(targetId)));
      return () => {
        try {
          unsub?.();
        } catch {}
      };
    }
    return;
  }, [callIsFav, targetId]);

  // Fallback: keep in sync when localStorage changes (if persisted)
  useEffect(() => {
    const onStorage = () => setFav(callIsFav(targetId));
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [callIsFav, targetId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (liveTimerRef.current) {
        clearTimeout(liveTimerRef.current);
        liveTimerRef.current = null;
      }
    };
  }, []);

  const onClick = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!targetId) return;

      const now = Date.now();
      if (now < cooldownRef.current || pending) return;
      cooldownRef.current = now + 600;

      setPending(true);
      const prev = fav;
      const next = !prev;
      setFav(next); // optimistic

      try {
        const confirmed = await callToggle(targetId);
        setFav(confirmed);

        toast.dismiss();
        if (confirmed) {
          toast.success("Saved to favorites");
          trackClient("favorite_add", { id: targetId, type: targetType });
          announce(`${labelPrefix} saved to favorites`);
        } else {
          toast("Removed from favorites", { icon: "💔" });
          trackClient("favorite_remove", { id: targetId, type: targetType });
          announce(`${labelPrefix} removed from favorites`);
        }
      } catch {
        setFav(prev);
        toast.dismiss();
        toast.error("Could not update favorites. Please try again.");
        announce(`Failed to update favorites for ${labelPrefix}`);
      } finally {
        if (mountedRef.current) setPending(false);
      }
    },
    [announce, callToggle, fav, labelPrefix, pending, targetId, targetType]
  );

  const aria = fav ? "Unsave" : "Save";
  const title = `${aria} ${labelPrefix}`;

  const heart = (
    <svg
      width={compact ? 18 : 20}
      height={compact ? 18 : 20}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={pending ? "opacity-70" : ""}
    >
      {fav ? (
        <path
          fill="currentColor"
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6.02 3.99 4 6.5 4c1.73 0 3.4.82 4.5 2.1C12.1 4.82 13.77 4 15.5 4 18.01 4 20 6.02 20 8.5c0 3.78-3.4 6.86-8.55 11.53L12 21.35z"
        />
      ) : (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          d="M12.1 20.55l-.1.1-.1-.1C7.14 16.24 4 13.39 4 9.9 4 7.6 5.6 6 7.9 6c1.54 0 3.04.99 3.6 2.36h1c.56-1.37 2.06-2.36 3.6-2.36 2.3 0 3.9 1.6 3.9 3.9 0 3.49-3.14 6.34-8.8 10.65z"
        />
      )}
    </svg>
  );

  if (compact) {
    return (
      <>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {live}
        </span>
        <button
          type="button"
          onClick={onClick}
          aria-label={aria}
          aria-pressed={fav}
          aria-busy={pending}
          disabled={pending}
          title={title}
          data-state={fav ? "on" : "off"}
          className={[
            "absolute top-2 right-2 rounded-full p-2 shadow-md border transition",
            fav
              ? "text-[#f95d9b] bg-white dark:bg-gray-900 dark:text-pink-400"
              : "text-gray-700 bg-white/95 hover:bg-white dark:bg-gray-900 dark:text-slate-200",
            "border-gray-200 dark:border-gray-700",
            pending ? "cursor-wait opacity-75" : "",
            className,
          ].join(" ")}
        >
          {heart}
        </button>
      </>
    );
  }

  return (
    <>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {live}
      </span>
      <button
        type="button"
        onClick={onClick}
        aria-label={aria}
        aria-pressed={fav}
        aria-busy={pending}
        disabled={pending}
        title={title}
        data-state={fav ? "on" : "off"}
        className={[
          "rounded-lg border px-5 py-3 font-semibold flex items-center gap-2 transition",
          fav
            ? "text-[#f95d9b] border-[#f95d9b] bg-white dark:bg-gray-900 dark:text-pink-400"
            : "hover:bg-gray-50 dark:hover:bg-gray-800 dark:border-gray-700",
          "border-gray-300 text-gray-900 dark:text-slate-100",
          pending ? "opacity-75 cursor-wait" : "",
          className,
        ].join(" ")}
      >
        {heart}
        {fav ? "Saved" : "Save"}
      </button>
    </>
  );
}
