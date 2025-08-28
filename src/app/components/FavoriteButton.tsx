"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useFavourites } from "../lib/favoritesStore";

type Props = {
  productId: string | number;
  /** Small overlay style used on cards */
  compact?: boolean;
  /** Optional: override accessible label prefix (e.g., "Listing") */
  labelPrefix?: string;
};

export default function FavoriteButton({ productId, compact = false, labelPrefix = "Item" }: Props) {
  const { ids, isFavourite, toggle } = useFavourites();
  const [fav, setFav] = useState<boolean>(false);
  const [pending, setPending] = useState(false);

  // Keep local `fav` in sync with store
  useEffect(() => {
    setFav(isFavourite(productId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, ids]);

  const onClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    // If inside a <Link> card, prevent navigation
    e.preventDefault();
    e.stopPropagation();

    if (pending) return;
    setPending(true);

    try {
      const next = await toggle(productId); // store returns the new state
      setFav(next);
      toast.dismiss();
      toast.success(next ? "Saved to favorites" : "Removed from favorites");
    } catch (err: any) {
      // In case your store ever throws; keep user informed
      toast.dismiss();
      toast.error("Could not update favorites. Please try again.");
    } finally {
      setPending(false);
    }
  };

  const aria = fav ? "Unsave" : "Save";
  const title = `${aria} ${labelPrefix}`;

  // Shared icon (filled heart when fav, outline otherwise)
  const Heart = (
    <svg
      width={compact ? 18 : 20}
      height={compact ? 18 : 20}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={pending ? "opacity-70" : ""}
    >
      {fav ? (
        // Filled
        <path
          fill="currentColor"
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 4 4 6.5 4c1.74 0 3.41.81 4.5 2.09C12.09 4.81 13.76 4 15.5 4 18 4 20 6 20 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        />
      ) : (
        // Outline (stroke same path for simplicity)
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          d="M12.1 20.55l-.1.1-.1-.1C7.14 16.24 4 13.39 4 9.9 4 7.6 5.6 6 7.9 6c1.54 0 3.04.99 3.6 2.36h1.0C13.96 6.99 15.46 6 17 6c2.3 0 3.9 1.6 3.9 3.9 0 3.49-3.14 6.34-8.8 10.65z"
        />
      )}
    </svg>
  );

  if (compact) {
    return (
      <button
        onClick={onClick}
        aria-label={aria}
        aria-pressed={fav}
        disabled={pending}
        title={title}
        className={`absolute top-2 right-2 rounded-full p-2 shadow-md border transition
          ${fav ? "text-[#f95d9b] bg-white" : "text-gray-600 bg-white/90 hover:bg-white"}
          ${pending ? "cursor-wait" : ""}`}
      >
        {Heart}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      aria-label={aria}
      aria-pressed={fav}
      disabled={pending}
      title={title}
      className={`rounded-lg border px-5 py-3 font-semibold flex items-center gap-2 transition
        ${fav ? "text-[#f95d9b] border-[#f95d9b] bg-white" : "hover:bg-gray-50"}
        ${pending ? "opacity-70 cursor-wait" : ""}`}
    >
      {Heart}
      {fav ? "Saved" : "Save"}
    </button>
  );
}
