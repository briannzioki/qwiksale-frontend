// src/app/components/Stars.tsx
"use client";

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
            {/* Empty/base star */}
            <span
              className={`${emptyClassName} select-none`}
              style={{ fontSize: size, lineHeight: `${size}px` }}
            >
              ★
            </span>

            {/* Filled overlay (clipped to percentage) */}
            {fill > 0 && (
              <span
                className={`${fillClassName} absolute inset-0 overflow-hidden select-none`}
                style={{
                  width: `${Math.max(0, Math.min(1, fill)) * 100}%`,
                  fontSize: size,
                  lineHeight: `${size}px`,
                }}
              >
                ★
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
