"use client";

import { useFavorite } from "@/app/hooks/useFavorite";

export default function FavoriteButton({
  productId,
  initial = false,
  initialCount = 0,
  size = 18,
  className = "",
}: {
  productId: string;
  initial?: boolean;
  initialCount?: number;
  size?: number;
  className?: string;
}) {
  const { isFavorited, count, toggle, loading, error } = useFavorite(productId, {
    initial,
    initialCount,
  });

  return (
    <button
      type="button"
      onClick={() => toggle()}
      disabled={loading}
      aria-pressed={isFavorited}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm ${
        isFavorited ? "text-red-600" : "text-gray-600"
      } ${loading ? "opacity-60" : ""} ${className}`}
      title={isFavorited ? "Remove from favorites" : "Add to favorites"}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={isFavorited ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-colors"
        aria-hidden="true"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      <span>{count}</span>
      {error && <span className="sr-only">({error})</span>}
    </button>
  );
}
