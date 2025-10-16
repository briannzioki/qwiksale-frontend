// src/app/components/Chip.tsx
"use client";

import * as React from "react";

export type ChipProps = {
  children: React.ReactNode;
  dense?: boolean;            // use text-xs + tighter padding
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  as?: "span" | "button" | "a";
  href?: string;              // only used when as="a"
  /** Next 15: function props must be named *Action to be serializable */
  onClickAction?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
  title?: string;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

/**
 * Design goals:
 * - Default = calm/neutral chip.
 * - Outline on dark (dark:bg transparent, light border).
 * - Filled *very* lightly on light mode.
 * - `dense` toggles text-xs and tighter paddings for crowded rows.
 */
export default function Chip({
  children,
  dense = false,
  leadingIcon,
  trailingIcon,
  as = "span",
  href,
  onClickAction,
  className,
  title,
}: ChipProps) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full " +
    "border text-gray-700 dark:text-slate-200 " +
    "bg-white/80 dark:bg-transparent " +
    "border-gray-200 dark:border-white/10 " +
    "hover:bg-white dark:hover:bg-white/5 " +
    "transition";

  const size = dense ? "text-xs px-2.5 py-1" : "text-sm px-3 py-1.5";

  const classes = cn(base, size, className);

  if (as === "button") {
    return (
      <button type="button" onClick={onClickAction} className={classes} title={title}>
        {leadingIcon ? <span aria-hidden>{leadingIcon}</span> : null}
        <span className="truncate">{children}</span>
        {trailingIcon ? <span aria-hidden>{trailingIcon}</span> : null}
      </button>
    );
  }

  if (as === "a") {
    return (
      // eslint-disable-next-line jsx-a11y/anchor-is-valid
      <a href={href} className={classes} title={title}>
        {leadingIcon ? <span aria-hidden>{leadingIcon}</span> : null}
        <span className="truncate">{children}</span>
        {trailingIcon ? <span aria-hidden>{trailingIcon}</span> : null}
      </a>
    );
  }

  return (
    <span className={classes} title={title}>
      {leadingIcon ? <span aria-hidden>{leadingIcon}</span> : null}
      <span className="truncate">{children}</span>
      {trailingIcon ? <span aria-hidden>{trailingIcon}</span> : null}
    </span>
  );
}
