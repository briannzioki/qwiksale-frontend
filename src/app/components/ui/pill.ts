// src/app/components/ui/pill.ts

export type ClassValue = string | false | null | undefined;

export function cx(...xs: ClassValue[]) {
  return xs.filter(Boolean).join(" ");
}

export type PillSize = "sm" | "md" | "icon";

export type PillClassOpts = {
  active?: boolean;
  size?: PillSize;
  className?: string;
};

const PILL_BASE =
  "relative inline-flex items-center gap-1.5 rounded-xl border text-sm font-medium transition will-change-transform active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 ring-focus";

const PILL_SIZE: Record<PillSize, string> = {
  sm: "px-2.5 py-1.5",
  md: "px-3 py-2",
  icon: "h-9 w-9 p-0 justify-center",
};

const PILL_INACTIVE =
  "border-transparent text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]";

const PILL_ACTIVE =
  "bg-[var(--bg-subtle)] text-[var(--text)] border-[var(--border)] shadow-sm";

/**
 * Use for:
 * - nav pills (links)
 * - tabs / segmented items
 * - chip-like controls
 */
export function pillClass({
  active = false,
  size = "sm",
  className,
}: PillClassOpts = {}) {
  return cx(PILL_BASE, PILL_SIZE[size], active ? PILL_ACTIVE : PILL_INACTIVE, className);
}

/**
 * Convenience alias for icon-only buttons/links (h-9 w-9).
 */
export function pillIconClass(opts: Omit<PillClassOpts, "size"> = {}) {
  return pillClass({ ...opts, size: "icon" });
}

/**
 * Optional wrapper for segmented controls / tab rows.
 * Use to make groups look consistent without changing structure.
 */
export function pillGroupClass(className?: string) {
  return cx(
    "inline-flex items-center gap-1 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-1",
    className,
  );
}
