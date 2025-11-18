import { FiltersBarSkeleton, ProductGridSkeleton } from "@/app/components/Skeletons";

export default function Loading() {
  return (
    <main className="container-page py-6" aria-busy="true" aria-live="polite" role="status">
      <FiltersBarSkeleton />
      <div className="mt-4">
        <ProductGridSkeleton count={24} cols={{ base: 2, sm: 2, md: 3, xl: 4 }} />
      </div>
    </main>
  );
}
