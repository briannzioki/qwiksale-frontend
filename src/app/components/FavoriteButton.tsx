// src/app/components/FavoriteButton.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useFavourites } from "../lib/favoritesStore";

type Props = {
  productId: string | number;
  /** Small overlay style used on cards */
  compact?: boolean;
  /** Optional: override accessible label prefix (e.g., "Listing") */
  labelPrefix?: string;
  /** Optional extra classes for the button */
  className?: string;
};

/* ------------------------ tiny client analytics ------------------------ */
function trackClient(event: string, payload?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.log("[qs:track]", event, payload);
  if (typeof window !== "undefined" && "CustomEvent" in window) {
    window.dispatchEvent(new CustomEvent("qs:track", { detail: { event, payload } }));
  }
}

/* ------------------------------ component ------------------------------ */

export default function FavoriteButton({
  productId,
  compact = false,
  labelPrefix = "Item",
  className = "",
}: Props) {
  const pid = useMemo(() => String(productId), [productId]);
  const { ids, isFavourite, toggle } = useFavourites();

  // Local state mirrors store (optimistic updates supported)
  const [fav, setFav] = useState<boolean>(false);
  const [pending, setPending] = useState(false);
  const cooldownRef = useRef<number>(0); // timestamp (ms)
  const mountedRef = useRef(false);

  // A11y live region (screen-reader announce)
  const [live, setLive] = useState<string>("");

  // Sync from store when ids or productId change (avoid SSR hydration edge cases)
  useEffect(() => {
    setFav(isFavourite(pid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, ids]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const announce = (message: string) => {
    setLive(message);
    // Clear after a short moment so future messages are re-announced
    const t = setTimeout(() => setLive(""), 1200);
    return () => clearTimeout(t);
  };

  const onClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    // If inside a <Link> card, prevent navigation
    e.preventDefault();
    e.stopPropagation();

    // Basic cooldown (prevents accidental double toggles)
    const now = Date.now();
    if (now < cooldownRef.current) return;
    cooldownRef.current = now + 600;

    if (pending) return;
    setPending(true);

    // Optimistic UI
    const prev = fav;
    const next = !prev;
    setFav(next);

    try {
      // Store toggle returns the new definitive state
      const confirmed = await toggle(pid);
      setFav(confirmed);

      toast.dismiss();
      if (confirmed) {
        toast.success("Saved to favorites");
        trackClient("favorite_add", { productId: pid });
        announce(`${labelPrefix} saved to favorites`);
      } else {
        toast("Removed from favorites", { icon: "💔" });
        trackClient("favorite_remove", { productId: pid });
        announce(`${labelPrefix} removed from favorites`);
      }
    } catch (err) {
      // Rollback optimistic update
      setFav(prev);
      toast.dismiss();
      toast.error("Could not update favorites. Please try again.");
      announce(`Failed to update favorites for ${labelPrefix}`);
    } finally {
      if (mountedRef.current) setPending(false);
    }
  };

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
        {/* Live region for screen readers */}
        <span className="sr-only" aria-live="polite">
          {live}
        </span>

        <button
          type="button"
          onClick={onClick}
          aria-label={aria}
          aria-pressed={fav}
          disabled={pending}
          title={title}
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
      {/* Live region for screen readers */}
      <span className="sr-only" aria-live="polite">
        {live}
      </span>

      <button
        type="button"
        onClick={onClick}
        aria-label={aria}
        aria-pressed={fav}
        disabled={pending}
        title={title}
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
