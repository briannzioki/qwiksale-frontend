import { FiltersBarSkeleton, ProductGridSkeleton } from "@/app/components/Skeletons";

export default function Loading() {
  return (
    <main
      className="container-page py-4 sm:py-6"
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <FiltersBarSkeleton />
      <div className="mt-3 sm:mt-4">
        <ProductGridSkeleton count={24} cols={{ base: 1, sm: 2, md: 3, xl: 4 }} />
      </div>
    </main>
  );
}
