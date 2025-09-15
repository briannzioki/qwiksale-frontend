// src/app/components/favorites/FavoriteButton.tsx
"use client";

import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useFavorite } from "@/app/hooks/useFavorite";

/**
 * Lightweight, hook-driven Favorite button with count.
 * - Safe inside clickable cards (prevents unintended navigation)
 * - Cooldown to avoid spam clicks
 * - A11y: aria-pressed, dynamic title/label, live updates via sr-only
 * - Emits client events + analytics: "qs:favorite:toggle", "qs:track"
 */
type Props = {
  productId: string;
  /** Initial favorited state used by the hook for hydration/SSR */
  initial?: boolean;
  /** Initial count used by the hook for hydration/SSR */
  initialCount?: number;
  /** Icon size (px) */
  size?: number;
  /** Extra classes */
  className?: string;
  /** Hide numeric count badge */
  hideCount?: boolean;
  /** Optional override for the accessible label prefix (e.g., "Listing") */
  labelPrefix?: string;
  /** Optional style variant */
  variant?: "chip" | "icon";
};

function emit(name: string, detail?: unknown) {
  // eslint-disable-next-line no-console
  console.log(`[qs:event] ${name}`, detail);
  if (typeof window !== "undefined" && "CustomEvent" in window) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}
function track(event: string, payload?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.log("[qs:track]", event, payload);
  emit("qs:track", { event, payload });
}

export default function FavoriteButton({
  productId,
  initial = false,
  initialCount = 0,
  size = 18,
  className = "",
  hideCount = false,
  labelPrefix = "Item",
  variant = "chip",
}: Props) {
  const { isFavorited, count, toggle, loading, error } = useFavorite(productId, {
    initial,
    initialCount,
  });

  const [live, setLive] = useState<string>("");
  const cooldownUntilRef = useRef<number>(0);

  const title = useMemo(
    () =>
      isFavorited
        ? `Remove ${labelPrefix} from favorites`
        : `Add ${labelPrefix} to favorites`,
    [isFavorited, labelPrefix]
  );

  const onClick = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      // If nested in a <Link> card, avoid navigation
      e.preventDefault();
      e.stopPropagation();

      // Cooldown: avoid rapid double toggles
      const now = Date.now();
      if (now < cooldownUntilRef.current) return;
      cooldownUntilRef.current = now + 600;

      try {
        await toggle(); // hook manages state/optimism internally
        const next = !isFavorited;
        track(next ? "favorite_add" : "favorite_remove", { productId });
        emit("qs:favorite:toggle", { productId, favorited: next });
        setLive(
          next
            ? `${labelPrefix} saved to favorites`
            : `${labelPrefix} removed from favorites`
        );
        setTimeout(() => setLive(""), 1200);
      } catch {
        // Hook may surface error separately; provide SR feedback anyway
        setLive("Failed to update favorites");
        setTimeout(() => setLive(""), 1200);
      }
    },
    [isFavorited, labelPrefix, productId, toggle]
  );

  const Icon = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={isFavorited ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={isFavorited ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition-all"
      aria-hidden="true"
    >
      {/* Heart path (Lucide-like) */}
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );

  const baseClasses =
    "inline-flex items-center gap-1 rounded-full text-sm transition select-none";
  // Softer, on-theme accent when favorited (brand-ish blue)
  const colorClasses = isFavorited
    ? "text-[#39a0ca] dark:text-[#39a0ca]"
    : "text-gray-700 dark:text-slate-200";
  const stateClasses = loading ? "opacity-60 cursor-wait" : "hover:opacity-90";

  const shapeClasses =
    variant === "icon"
      ? "p-1.5"
      : "px-2 py-1 border border-black/10 dark:border-white/15 bg-white/80 dark:bg-white/10";

  return (
    <>
      {/* Live region for screen readers */}
      <span className="sr-only" aria-live="polite">
        {live}
      </span>

      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-pressed={isFavorited}
        title={title}
        className={[baseClasses, colorClasses, stateClasses, shapeClasses, className].join(" ")}
      >
        {Icon}
        {!hideCount && <span className="tabular-nums">{count ?? 0}</span>}
        {error && <span className="sr-only">({String(error)})</span>}
      </button>
    </>
  );
}
