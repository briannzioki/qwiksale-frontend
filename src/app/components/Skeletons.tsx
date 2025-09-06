import React, { memo } from "react";

/* ----------------------- Utilities ----------------------- */

function cx(...cls: Array<string | number | false | null | undefined>) {
  return cls.filter(Boolean).join(" ");
}

/* ----------------------- Tiny primitives ----------------------- */

type Rounded =
  | "rounded-none"
  | "rounded"
  | "rounded-md"
  | "rounded-lg"
  | "rounded-xl"
  | string;

type SkeletonProps = React.HTMLAttributes<HTMLElement> & {
  className?: string;
  rounded?: Rounded;
  /** Render element type (div/span/etc.) */
  as?: React.ElementType;
  /** Helpful in tests */
  "data-testid"?: string;
};

export const Skeleton = memo(function Skeleton({
  className = "",
  rounded = "rounded-md",
  as: Tag = "div",
  ...rest
}: SkeletonProps) {
  return (
    <Tag
      aria-hidden="true"
      className={cx(
        "motion-safe:animate-pulse motion-reduce:animate-none",
        "bg-gray-200/85 dark:bg-gray-800/60",
        "border border-transparent dark:border-gray-800/70",
        rounded,
        className
      )}
      {...rest}
    />
  );
});

export const SkeletonLine = memo(function SkeletonLine({
  w = "w-full",
  h = "h-3",
  className = "",
}: {
  w?: string;
  h?: string;
  className?: string;
}) {
  return <Skeleton className={cx(w, h, "overflow-hidden", className)} rounded="rounded" />;
});

export const ButtonSkeleton = memo(function ButtonSkeleton({ w = "w-28" }: { w?: string }) {
  return <Skeleton className={cx("h-9", w)} rounded="rounded-lg" />;
});

/* ----------------------- Product Card ----------------------- */

export const ProductCardSkeleton = memo(function ProductCardSkeleton({
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
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="relative">
        {/* badge spot */}
        {!compact && showBadge && (
          <div className="absolute top-2 left-2 z-10">
            <Skeleton className="h-5 w-16 bg-gray-300/80 dark:bg-gray-700/70" rounded="rounded-md" />
          </div>
        )}

        <Skeleton className={cx("w-full", imageHeightClass)} rounded="rounded-none" />

        {/* heart spot */}
        {showHeart && (
          <div className="absolute top-2 right-2">
            <Skeleton className="h-8 w-8 bg-white/70 dark:bg-gray-700/70" rounded="rounded-full" />
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

export function ProductGridSkeleton({
  count = 8,
  cols = { base: 1, sm: 2, md: 3, xl: 4 },
  cardProps,
}: {
  count?: number | undefined; // allow undefined explicitly
  cols?: { base?: number; sm?: number; md?: number; xl?: number } | undefined; // allow undefined explicitly
  cardProps?: React.ComponentProps<typeof ProductCardSkeleton> | undefined; // allow undefined explicitly
}) {
  const items = Array.from({ length: Math.max(1, count) });

  // Use ternaries so we never pass a raw 0 to cx (which would otherwise be included)
  const grid = cx(
    `grid grid-cols-${Math.max(1, cols.base ?? 1)}`,
    cols.sm && cols.sm > 0 ? `sm:grid-cols-${cols.sm}` : undefined,
    cols.md && cols.md > 0 ? `md:grid-cols-${cols.md}` : undefined,
    cols.xl && cols.xl > 0 ? `xl:grid-cols-${cols.xl}` : undefined,
    "gap-6"
  );

  return (
    <section className={grid} aria-busy="true" aria-live="polite">
      {items.map((_, i) => (
        <ProductCardSkeleton key={i} {...cardProps} />
      ))}
    </section>
  );
}

/* ----------------------- Filters Bar ----------------------- */

export const FiltersBarSkeleton = memo(function FiltersBarSkeleton({
  withClear = true,
}: {
  withClear?: boolean;
}) {
  return (
    <div className="w-full rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 px-4 py-3 shadow-sm">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-end lg:justify-between">
        {/* search box + clear */}
        <div className="flex-1 flex gap-2">
          <Skeleton className="h-10 w-full" />
          {withClear && <ButtonSkeleton w="w-20" />}
        </div>

        {/* condition / sort / min / max */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 w-full lg:w-auto">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
});

/* ----------------------- Product Detail ----------------------- */

export function ProductDetailSkeleton({
  thumbs = 8,
  heroHeightClass = "h-80",
}: {
  thumbs?: number;
  heroHeightClass?: string;
}) {
  const thumbCount = Math.max(0, thumbs);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6" aria-busy="true">
      {/* images */}
      <div className="lg:col-span-3">
        <div className="relative bg-white dark:bg-gray-900 rounded-xl border dark:border-gray-800 shadow-sm overflow-hidden">
          <Skeleton className={cx("w-full", heroHeightClass)} rounded="rounded-none" />
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          {Array.from({ length: thumbCount }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>

      {/* right column */}
      <div className="lg:col-span-2 space-y-4">
        {/* title + chip + fav */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <SkeletonLine w="w-3/5" h="h-5" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-5 w-24 bg-gray-300/80 dark:bg-gray-700/70" rounded="rounded-full" />
            </div>
          </div>
          <Skeleton className="h-9 w-24" rounded="rounded-lg" />
        </div>

        {/* price card */}
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4 space-y-2">
          <SkeletonLine w="w-40" h="h-6" />
          <SkeletonLine w="w-24" />
          <SkeletonLine w="w-28" />
          <SkeletonLine w="w-28" />
        </div>

        {/* description */}
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4 space-y-2">
          <SkeletonLine w="w-28" h="h-4" />
          <SkeletonLine />
          <SkeletonLine w="w-11/12" />
          <SkeletonLine w="w-10/12" />
        </div>

        {/* seller box */}
        <div className="rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 p-4 space-y-2">
          <SkeletonLine w="w-24" h="h-4" />
          <SkeletonLine w="w-1/2" />
          <SkeletonLine w="w-1/3" />
          <SkeletonLine w="w-1/4" />
          <div className="mt-3 flex gap-3">
            <ButtonSkeleton w="w-36" />
            <ButtonSkeleton w="w-24" />
            <Skeleton className="h-7 w-40 bg-gray-300/80 dark:bg-gray-700/70 ml-auto" rounded="rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------- Page Scaffolds ----------------------- */

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
      {/* Only pass `cols` when it exists to satisfy exactOptionalPropertyTypes */}
      <ProductGridSkeleton
        count={gridCount}
        {...(gridCols !== undefined ? { cols: gridCols } : {})}
      />
    </div>
  );
}
