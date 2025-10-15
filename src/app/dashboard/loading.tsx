// src/app/dashboard/loading.tsx
import { Skeleton, SkeletonLine, ButtonSkeleton } from "@/app/components/Skeletons";

export default function Loading() {
  return (
    <main className="container-page py-6" aria-busy="true" aria-live="polite" role="status">
      {/* header */}
      <div className="flex items-center justify-between">
        <SkeletonLine w="w-64" h="h-6" />
        <div className="flex gap-2">
          <ButtonSkeleton w="w-24" />
          <ButtonSkeleton w="w-24" />
        </div>
      </div>

      {/* table-ish card */}
      <div className="mt-4 rounded-2xl border bg-white p-4 dark:bg-slate-900/40 dark:border-slate-800">
        {/* header row */}
        <div className="grid grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full rounded-md" />
          ))}
        </div>

        {/* rows */}
        <div className="mt-3 space-y-3">
          {Array.from({ length: 6 }).map((_, r) => (
            <div key={r} className="grid grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((__, c) => (
                <Skeleton key={c} className="h-4 w-full rounded-md" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
