// src/app/components/Skeletons.tsx

// Tiny primitives
function cx(...cls: Array<string | false | null | undefined>) {
  return cls.filter(Boolean).join(" ");
}

export function Skeleton({
  className = "",
  rounded = "rounded-md",
}: { className?: string; rounded?: string }) {
  return <div className={cx("animate-pulse bg-gray-200", rounded, className)} aria-hidden="true" />;
}

export function SkeletonLine({
  w = "w-full",
  h = "h-3",
  className = "",
}: { w?: string; h?: string; className?: string }) {
  return <Skeleton className={cx(w, h, className)} rounded="rounded" />;
}

export function ButtonSkeleton({ w = "w-28" }: { w?: string }) {
  return <Skeleton className={cx("h-9", w)} rounded="rounded-lg" />;
}

/* ----------------------- Product Card ----------------------- */

export function ProductCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
      <div className="relative">
        {/* badge spot */}
        {!compact && (
          <div className="absolute top-2 left-2 z-10">
            <Skeleton className="h-5 w-16 bg-gray-300/80" rounded="rounded-md" />
          </div>
        )}

        <Skeleton className="w-full h-44" rounded="rounded-none" />
        {/* heart spot */}
        <div className="absolute top-2 right-2">
          <Skeleton className="h-8 w-8 bg-white/70" rounded="rounded-full" />
        </div>
      </div>

      <div className="p-4 space-y-2">
        <SkeletonLine w="w-4/5" h="h-4" />
        <SkeletonLine w="w-3/5" />
        <SkeletonLine w="w-2/5" />
        <SkeletonLine w="w-1/3" h="h-5" className="mt-2" />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  const items = Array.from({ length: Math.max(1, count) });
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
      {items.map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </section>
  );
}

/* ----------------------- Filters Bar ----------------------- */

export function FiltersBarSkeleton() {
  return (
    <div className="w-full rounded-xl border bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-end lg:justify-between">
        {/* search box + clear */}
        <div className="flex-1 flex gap-2">
          <Skeleton className="h-10 w-full" />
          <ButtonSkeleton w="w-20" />
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
}

/* ----------------------- Product Detail ----------------------- */

export function ProductDetailSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* images */}
      <div className="lg:col-span-3">
        <div className="relative bg-white rounded-xl border shadow-sm overflow-hidden">
          <Skeleton className="w-full h-80" rounded="rounded-none" />
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
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
              <Skeleton className="h-5 w-24 bg-gray-300/80" rounded="rounded-full" />
            </div>
          </div>
          <Skeleton className="h-9 w-24" rounded="rounded-lg" />
        </div>

        {/* price card */}
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <SkeletonLine w="w-40" h="h-6" />
          <SkeletonLine w="w-24" />
          <SkeletonLine w="w-28" />
          <SkeletonLine w="w-28" />
        </div>

        {/* description */}
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <SkeletonLine w="w-28" h="h-4" />
          <SkeletonLine />
          <SkeletonLine w="w-11/12" />
          <SkeletonLine w="w-10/12" />
        </div>

        {/* seller box */}
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <SkeletonLine w="w-24" h="h-4" />
          <SkeletonLine w="w-1/2" />
          <SkeletonLine w="w-1/3" />
          <SkeletonLine w="w-1/4" />
          <div className="mt-3 flex gap-3">
            <ButtonSkeleton w="w-36" />
            <ButtonSkeleton w="w-24" />
            <Skeleton className="h-7 w-40 bg-gray-300/80 ml-auto" rounded="rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------- Page Scaffolds ----------------------- */

export function HomePageSkeleton() {
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
      <ProductGridSkeleton count={12} />
    </div>
  );
}
