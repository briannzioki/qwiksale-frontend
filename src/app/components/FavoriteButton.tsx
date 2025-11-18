"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useFavourites } from "../lib/favoritesStore";

type Kind = "product" | "service";

type BaseProps = {
  /** Small icon-only pill for toolbars/overlays */
  compact?: boolean;
  /** For a11y messages and titles: "Item" | "Service" ... */
  labelPrefix?: string;
  /** Extra classes appended to the computed classes */
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
  const store = useFavourites() as any;

  const callIsFav = useCallback(
    (id: string): boolean => {
      try {
        const fn =
          typeof store?.isFavourite === "function"
            ? store.isFavourite
            : typeof store?.isFavorite === "function"
            ? store.isFavorite
            : typeof store?.isFav === "function"
            ? store.isFav
            : null;

        if (fn) {
          // Prefer (id, type) if supported; extra args are ignored otherwise.
          return !!fn.call(store, id, targetType);
        }

        // Map/array fallbacks
        if (store?.idsByType && Array.isArray(store.idsByType[targetType])) {
          return store.idsByType[targetType].map(String).includes(id);
        }
        if (targetType === "product" && Array.isArray(store?.productIds)) {
          return store.productIds.map(String).includes(id);
        }
        if (targetType === "service" && Array.isArray(store?.serviceIds)) {
          return store.serviceIds.map(String).includes(id);
        }
        if (Array.isArray(store?.ids)) {
          return store.ids.map(String).includes(id);
        }
      } catch {
        /* ignore */
      }
      return false;
    },
    [store, targetType]
  );

  const callToggle = useCallback(
    async (id: string): Promise<boolean> => {
      const fn =
        typeof store?.toggle === "function"
          ? store.toggle
          : typeof store?.toggleFavourite === "function"
          ? store.toggleFavourite
          : typeof store?.toggleFavorite === "function"
          ? store.toggleFavorite
          : null;

      if (!fn) throw new Error("Favorites not available");

      try {
        // Call with (id, type). If the implementation ignores the 2nd arg, that's fine.
        const res = await fn.call(store, id, targetType);
        if (typeof res === "boolean") return res;
        return callIsFav(id);
      } catch {
        // If the store threw, reflect current store state
        return callIsFav(id);
      }
    },
    [store, targetType, callIsFav]
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

  // Initial sync + on id/type change
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

  // IMPORTANT: Avoid "Save"/"Saved" in button's accessible name
  const aria = fav ? "Unfavorite" : "Favorite";
  const title = `${aria} ${labelPrefix}`;

  const HeartIcon = ({ filled, size = 18 }: { filled: boolean; size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={pending ? "opacity-70" : ""}
    >
      {filled ? (
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

  /* ----------------------------- RENDER ----------------------------- */

  if (compact) {
    // Compact = icon-only crisp pill (used in media overlays, cards, etc.)
    return (
      <>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {live}
        </span>
        <button
          type="button"
          onClick={async (e) => {
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
          }}
          aria-label={aria}
          aria-pressed={fav}
          aria-busy={pending}
          disabled={pending}
          title={title}
          data-state={fav ? "on" : "off"}
          className={[
            "btn-outline p-2 rounded-full inline-flex items-center justify-center",
            fav ? "text-[#f95d9b] border-[#f95d9b]" : "",
            pending ? "cursor-wait opacity-75" : "",
            className,
          ].join(" ")}
        >
          <HeartIcon filled={fav} size={18} />
        </button>
      </>
    );
  }

  // Non-compact = pill with label (matches btn-outline everywhere else)
  return (
    <>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {live}
      </span>
      <button
        type="button"
        onClick={async (e) => {
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
        }}
        aria-label={aria}
        aria-pressed={fav}
        aria-busy={pending}
        disabled={pending}
        title={title}
        data-state={fav ? "on" : "off"}
        className={[
          "btn-outline inline-flex items-center gap-2",
          fav ? "text-[#f95d9b] border-[#f95d9b]" : "",
          pending ? "opacity-75 cursor-wait" : "",
          className,
        ].join(" ")}
      >
        <HeartIcon filled={fav} size={20} />
        {fav ? "Favorited" : "Favorite"}
      </button>
    </>
  );
}
