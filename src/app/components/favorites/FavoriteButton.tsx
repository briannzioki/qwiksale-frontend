"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFavorite } from "@/app/hooks/useFavorite";

/**
 * FavoriteButton — works for both products and services.
 * - Back-compat: still supports productId prop
 * - New: entity + entityId (entity: "product" | "service")
 * - Emits qs:favorite:toggle and qs:track with entity metadata
 */
type Entity = "product" | "service";

type Props = {
  /** New, preferred props */
  entity?: Entity;
  entityId?: string;

  /** Back-compat (either still works) */
  productId?: string;
  serviceId?: string;

  /** Initial states for hydration/SSR */
  initial?: boolean;
  initialCount?: number;

  /** UI tweaks */
  size?: number;
  className?: string;
  hideCount?: boolean;
  labelPrefix?: string;
  variant?: "chip" | "icon";

  /** Optional callback fired after a successful toggle */
  onToggledAction?: (next: boolean) => void | Promise<void>;
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
  entity,
  entityId,

  // legacy aliases (still supported)
  productId,
  serviceId,

  initial = false,
  initialCount = 0,
  size = 18,
  className = "",
  hideCount = false,
  labelPrefix = "Item",
  variant = "chip",
  onToggledAction,
}: Props) {
  // ---------- Resolve entity + id with sensible fallbacks ----------
  let resolvedEntity: Entity | undefined = entity;
  let resolvedId: string | undefined = entityId;

  if (!resolvedEntity || !resolvedId) {
    if (productId) {
      resolvedEntity = "product";
      resolvedId = productId;
    } else if (serviceId) {
      resolvedEntity = "service";
      resolvedId = serviceId;
    }
  }

  // Final guard (don’t crash the tree; just render a disabled icon)
  if (!resolvedEntity || !resolvedId) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[FavoriteButton] Missing entity/entityId (or productId/serviceId). Button will render disabled."
      );
    }
  }

  // Hook: allow passing entity as an option (safe if hook ignores it)
  const { isFavorited, count, toggle, loading, error } = useFavorite(resolvedId || "", {
    initial,
    initialCount,
    entity: resolvedEntity,
  } as any);

  const [live, setLive] = useState<string>("");
  const cooldownUntilRef = useRef<number>(0);
  const liveTimeoutRef = useRef<number | null>(null);

  // compact number for visual; keep full number for SR users
  const fmt = useMemo(
    () =>
      typeof Intl !== "undefined"
        ? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 })
        : null,
    []
  );

  useEffect(() => {
    return () => {
      if (liveTimeoutRef.current) {
        clearTimeout(liveTimeoutRef.current);
        liveTimeoutRef.current = null;
      }
    };
  }, []);

  const title = useMemo(
    () =>
      isFavorited
        ? `Remove ${labelPrefix} from favorites`
        : `Add ${labelPrefix} to favorites`,
    [isFavorited, labelPrefix]
  );
  // IMPORTANT: Avoid “Save/Unsave” so we don’t match /save|update|edit/i
  const ariaLabel = useMemo(
    () => (isFavorited ? `Unfavorite ${labelPrefix}` : `Favorite ${labelPrefix}`),
    [isFavorited, labelPrefix]
  );

  const onClick = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      // If nested in a <Link> card, avoid navigation
      e.preventDefault();
      e.stopPropagation();

      if (!resolvedId || !resolvedEntity) return;

      // Cooldown to avoid spam toggles
      const now = Date.now();
      if (now < cooldownUntilRef.current) return;
      cooldownUntilRef.current = now + 600;

      const next = !isFavorited;

      try {
        await toggle(); // hook handles optimism/staleness

        // tiny haptic nudge when available
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            (navigator as any).vibrate?.(12);
          } catch {/* ignore */}
        }

        // analytics + events include entity info
        track(next ? "favorite_add" : "favorite_remove", {
          entity: resolvedEntity,
          entityId: resolvedId,
        });
        emit("qs:favorite:toggle", { entity: resolvedEntity, entityId: resolvedId, favorited: next });

        if (onToggledAction) await onToggledAction(next);

        if (liveTimeoutRef.current) clearTimeout(liveTimeoutRef.current);
        setLive(next ? `${labelPrefix} saved to favorites` : `${labelPrefix} removed from favorites`);
        liveTimeoutRef.current = window.setTimeout(() => {
          setLive("");
          liveTimeoutRef.current = null;
        }, 1200);
      } catch {
        if (liveTimeoutRef.current) clearTimeout(liveTimeoutRef.current);
        setLive("Failed to update favorites");
        liveTimeoutRef.current = window.setTimeout(() => {
          setLive("");
          liveTimeoutRef.current = null;
        }, 1200);
      }
    },
    [isFavorited, labelPrefix, resolvedEntity, resolvedId, toggle, onToggledAction]
  );

  const icon = useMemo(
    () => (
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
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
    [isFavorited, size]
  );

  const baseClasses =
    "inline-flex items-center gap-1 rounded-full text-sm transition select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#39a0ca]";
  const colorClasses = isFavorited
    ? "text-[#39a0ca] dark:text-[#39a0ca]"
    : "text-gray-700 dark:text-slate-200";
  const stateClasses = loading ? "opacity-60 cursor-wait" : "hover:opacity-90 active:opacity-100";
  const shapeClasses =
    variant === "icon"
      ? "p-1.5"
      : "px-2 py-1 border border-black/10 dark:border-white/15 bg-white/80 dark:bg-white/10";

  const c = count ?? 0;
  const visualCount = fmt ? fmt.format(c) : String(c);
  const isCoolingDown = Date.now() < cooldownUntilRef.current;

  const disabled = loading || !resolvedId || !resolvedEntity;

  return (
    <>
      {/* Live region for screen readers */}
      <span className="sr-only" aria-live="polite">
        {live}
      </span>

      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={!!isFavorited}
        aria-busy={loading}
        aria-label={ariaLabel}
        title={title}
        aria-describedby={error ? `fav-err-${resolvedEntity}-${resolvedId}` : undefined}
        data-state={isFavorited ? "on" : "off"}
        data-entity={resolvedEntity || ""}
        data-id={resolvedId || ""}
        data-cooldown={isCoolingDown ? "1" : "0"}
        className={[baseClasses, colorClasses, stateClasses, shapeClasses, className].join(" ")}
      >
        {icon}
        {!hideCount && (
          <span className="tabular-nums">
            <span aria-hidden="true">{visualCount}</span>
            <span className="sr-only">{c}</span>
          </span>
        )}
      </button>

      {error ? (
        <span id={`fav-err-${resolvedEntity}-${resolvedId}`} className="sr-only" role="alert">
          {String(error)}
        </span>
      ) : null}
    </>
  );
}
