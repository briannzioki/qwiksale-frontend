// src/app/components/Skeleton.tsx
"use client";

import * as React from "react";

/* -------------------------------------------------------------------------- */
/* Utils                                                                      */
/* -------------------------------------------------------------------------- */

function cx(...cls: Array<string | number | false | null | undefined>) {
  return cls.filter(Boolean).join(" ");
}

/** Respect OS-level “Reduce Motion” */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(!!mq.matches);
    update();
    if ("addEventListener" in mq) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    // Safari < 14
    // @ts-expect-error legacy
    mq.addListener(update);
    // @ts-expect-error legacy
    return () => mq.removeListener(update);
  }, []);
  return reduced;
}

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

type Rounded =
  | "rounded-none"
  | "rounded"
  | "rounded-md"
  | "rounded-lg"
  | "rounded-xl"
  | "rounded-2xl"
  | "rounded-3xl"
  | "rounded-full"
  | string;

export type SkeletonProps = React.HTMLAttributes<HTMLElement> & {
  className?: string;
  rounded?: Rounded;
  /** Render element type (div/span/etc.) */
  as?: React.ElementType;
  /** Helpful in tests */
  "data-testid"?: string;
  /** Enable shimmering highlight (preferred) */
  shimmer?: boolean;
};

export const Skeleton = React.memo(function Skeleton({
  className = "",
  rounded = "rounded-md",
  as: Tag = "div",
  shimmer = true,
  ...rest
}: SkeletonProps) {
  const reduceMotion = usePrefersReducedMotion();
  const useShimmer = shimmer && !reduceMotion;

  // Base .skeleton styling from globals.css; shimmer overlay uses .skeleton-shimmer
  return (
    <Tag
      aria-hidden="true"
      className={cx("skeleton", useShimmer && "skeleton-shimmer", rounded, className)}
      {...rest}
    />
  );
});

export const SkeletonLine = React.memo(function SkeletonLine({
  w = "w-full",
  h = "h-3",
  className = "",
  rounded = "rounded",
  shimmer = true,
}: {
  w?: string;
  h?: string;
  className?: string;
  rounded?: Rounded;
  shimmer?: boolean;
}) {
  return (
    <Skeleton
      className={cx(w, h, "overflow-hidden", className)}
      rounded={rounded}
      shimmer={shimmer}
    />
  );
});

export const ButtonSkeleton = React.memo(function ButtonSkeleton({
  w = "w-28",
  h = "h-9",
  rounded = "rounded-lg",
  className,
}: {
  w?: string;
  h?: string;
  rounded?: Rounded;
  className?: string;
}) {
  return <Skeleton className={cx(h, w, className)} rounded={rounded} />;
});

/* -------------------------------------------------------------------------- */
/* Product Card                                                               */
/* -------------------------------------------------------------------------- */

export const ProductCardSkeleton = React.memo(function ProductCardSkeleton({
  compact = false,
  showBadge = true,
  showHeart = true,
  imageHeightClass = "h-44",
}: {
  compact?: boolean;
  showBadge?: boolean;
  showHeart?: boolean;
  imageHeightClass?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900/40 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden">
      <div className="relative">
        {!compact && showBadge && (
          <div className="absolute top-2 left-2 z-10">
            <Skeleton className="h-5 w-16" rounded="rounded-md" />
          </div>
        )}

        <Skeleton className={cx("w-full", imageHeightClass)} rounded="rounded-none" />

        {showHeart && (
          <div className="absolute top-2 right-2">
            <Skeleton className="h-8 w-8" rounded="rounded-full" />
          </div>
        )}
      </div>

      <div className="p-4 space-y-2">
        <SkeletonLine w="w-4/5" h="h-4" />
        <SkeletonLine w="w-3/5" />
        <SkeletonLine w="w-2/5" />
        <SkeletonLine w="w-1/3" h="h-5" className="mt-2" />
      </div>
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Grid helpers (Tailwind safelist)                                           */
/* -------------------------------------------------------------------------- */

const COL_CLASS: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

function gridColsClass(n?: number, prefix?: string) {
  const clamped = Math.max(1, Math.min(6, n ?? 1)) as 1 | 2 | 3 | 4 | 5 | 6;
  const base = COL_CLASS[clamped];
  return prefix ? `${prefix}:${base}` : base;
}

export function ProductGridSkeleton({
  count = 8,
  cols = { base: 1, sm: 2, md: 3, xl: 4 },
  cardProps,
}: {
  count?: number;
  cols?: { base?: number; sm?: number; md?: number; xl?: number };
  cardProps?: React.ComponentProps<typeof ProductCardSkeleton>;
}) {
  const items = Array.from({ length: Math.max(1, count) });

  const grid = cx(
    "grid gap-6",
    gridColsClass(cols?.base ?? 1),
    cols?.sm ? gridColsClass(cols.sm, "sm") : undefined,
    cols?.md ? gridColsClass(cols.md, "md") : undefined,
    cols?.xl ? gridColsClass(cols.xl, "xl") : undefined
  );

  return (
    <section className={grid} aria-busy="true" aria-live="polite" role="status">
      {items.map((_, i) => (
        <ProductCardSkeleton key={i} {...cardProps} />
      ))}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Filters Bar                                                                */
/* -------------------------------------------------------------------------- */

export const FiltersBarSkeleton = React.memo(function FiltersBarSkeleton({
  withClear = true,
}: {
  withClear?: boolean;
}) {
  return (
    <div className="w-full rounded-2xl border bg-white dark:bg-slate-900/40 dark:border-slate-800 px-4 py-3">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-end lg:justify-between">
        {/* search box + clear */}
        <div className="flex-1 flex gap-2">
          <Skeleton className="h-10 w-full rounded-xl" />
          {withClear && <ButtonSkeleton w="w-20" />}
        </div>

        {/* condition / sort / min / max */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 w-full lg:w-auto">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Product Detail                                                             */
/* -------------------------------------------------------------------------- */

export function ProductDetailSkeleton({
  thumbs = 8,
  heroHeightClass = "h-80",
}: {
  thumbs?: number;
  heroHeightClass?: string;
}) {
  const thumbCount = Math.max(0, thumbs);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6" aria-busy="true" role="status">
      {/* images */}
      <div className="lg:col-span-3">
        <div className="relative bg-white dark:bg-slate-900/40 rounded-2xl border dark:border-slate-800 overflow-hidden">
          <Skeleton className={cx("w-full", heroHeightClass)} rounded="rounded-none" />
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          {Array.from({ length: thumbCount }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>

      {/* right column */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <SkeletonLine w="w-3/5" h="h-5" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-36 rounded-md" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>

        <div className="rounded-2xl border bg-white dark:bg-slate-900/40 dark:border-slate-800 p-4 space-y-2">
          <SkeletonLine w="w-40" h="h-6" />
          <SkeletonLine w="w-24" />
          <SkeletonLine w="w-28" />
          <SkeletonLine w="w-28" />
        </div>

        <div className="rounded-2xl border bg-white dark:bg-slate-900/40 dark:border-slate-800 p-4 space-y-2">
          <SkeletonLine w="w-28" h="h-4" />
          <SkeletonLine />
          <SkeletonLine w="w-11/12" />
          <SkeletonLine w="w-10/12" />
        </div>

        <div className="rounded-2xl border bg-white dark:bg-slate-900/40 dark:border-slate-800 p-4 space-y-2">
          <SkeletonLine w="w-24" h="h-4" />
          <SkeletonLine w="w-1/2" />
          <SkeletonLine w="w-1/3" />
          <SkeletonLine w="w-1/4" />
          <div className="mt-3 flex gap-3">
            <ButtonSkeleton w="w-36" />
            <ButtonSkeleton w="w-24" />
            <Skeleton className="h-7 w-40 rounded-full ml-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page Scaffolds                                                             */
/* -------------------------------------------------------------------------- */

export function HomePageSkeleton({
  gridCount = 12,
  gridCols,
}: {
  gridCount?: number;
  gridCols?: React.ComponentProps<typeof ProductGridSkeleton>["cols"];
}) {
  return (
    <div className="flex flex-col gap-6">
      <FiltersBarSkeleton />
      <div className="flex items-center justify-between">
        <SkeletonLine w="w-64" />
        <div className="flex gap-2">
          <ButtonSkeleton w="w-16" />
          <ButtonSkeleton w="w-16" />
        </div>
      </div>
      <ProductGridSkeleton
        count={gridCount}
        {...(gridCols !== undefined ? { cols: gridCols } : {})}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Default export                                                             */
/* -------------------------------------------------------------------------- */

export default Skeleton;
