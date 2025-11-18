"use client";
// src/app/components/Stars.tsx

type StarsProps = {
  /** Current rating value (can be fractional) */
  rating: number;
  /** Total number of stars to display */
  outOf?: number;
  /** Star size in pixels */
  size?: number;
  /** Tailwind class for filled stars */
  fillClassName?: string;
  /** Tailwind class for empty star outline */
  emptyClassName?: string;
  /** Optional wrapper className */
  className?: string;
  /** Show "x.y/5" text next to the stars */
  showNumeric?: boolean;
};

export default function Stars({
  rating,
  outOf = 5,
  size = 16,
  fillClassName = "text-amber-500",
  emptyClassName = "text-gray-300 dark:text-slate-600",
  className = "",
  showNumeric = false,
}: StarsProps) {
  // Clamp inputs
  const total = Math.max(1, Math.round(outOf));
  const value = Math.max(0, Math.min(Number.isFinite(rating) ? rating : 0, total));

  const full = Math.floor(value);
  const frac = value - full; // 0..1

  const aria = `${value.toFixed(1)} out of ${total} stars`;

  // Single star path (rounded corners, looks good at small sizes)
  const StarPath = (
    <path d="M12 17.27l-5.47 3.2 1.45-6.03L3 9.52l6.19-.53L12 3.5l2.81 5.49 6.19.53-4.98 4.92 1.45 6.03L12 17.27z" />
  );

  return (
    <div
      className={`inline-flex items-center gap-1 ${className}`}
      role="img"
      aria-label={aria}
      title={aria}
    >
      {Array.from({ length: total }).map((_, i) => {
        // Determine how much of this star is filled (0..1)
        const fill = i < full ? 1 : i === full ? frac : 0;

        return (
          <span
            key={i}
            className="relative inline-block align-middle"
            style={{ width: size, height: size, lineHeight: `${size}px` }}
            aria-hidden="true"
          >
            {/* Empty/base star (outline) */}
            <svg
              viewBox="0 0 24 24"
              width={size}
              height={size}
              className={`${emptyClassName}`}
              aria-hidden
            >
              {StarPath}
            </svg>

            {/* Filled overlay clipped to percentage */}
            {fill > 0 && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%` }}
                aria-hidden
              >
                <svg
                  viewBox="0 0 24 24"
                  width={size}
                  height={size}
                  className={`${fillClassName}`}
                >
                  {StarPath}
                </svg>
              </span>
            )}
          </span>
        );
      })}

      {showNumeric && (
        <span className="ml-1 text-xs text-gray-600 dark:text-slate-400" aria-hidden="true">
          {value.toFixed(1)}/{total}
        </span>
      )}
    </div>
  );
}
